(function () {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};
  const SHEET_NAME = CONFIG.allowedSheetName || 'mail_recipients';
  const REQUIRED_HEADERS = ['会社名', '氏名', 'メールアドレス', 'ステータス', '送信日時', 'エラー内容'];
  const SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ].join(' ');

  const DEFAULT_TEMPLATE = {
    subject: 'ご連絡',
    body: '{{会社名}}\n{{宛名}}\n\nいつもお世話になっております。\n\n本文をここに入力してください。\n\n{{署名}}',
    signature: '',
  };

  const state = {
    accessToken: '',
    tokenClient: null,
    user: null,
    spreadsheet: null,
    rows: [],
    selectedRowIndex: 0,
    filter: 'all',
    librariesReady: false,
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindElements();
    bindEvents();
    showConfigWarningIfNeeded();
    setDefaultTemplate();
    waitForGoogleLibraries();
  }

  function bindElements() {
    [
      'accountStatus',
      'authorizeButton',
      'signoutButton',
      'spreadsheetInput',
      'loadSpreadsheetButton',
      'reloadButton',
      'selectedFileName',
      'loadSummary',
      'configWarning',
      'saveTemplateButton',
      'subjectTemplate',
      'bodyTemplate',
      'signatureTemplate',
      'previewSummary',
      'emptyState',
      'previewContent',
      'recipientTableBody',
      'previewTo',
      'previewSubject',
      'previewBody',
      'showAllButton',
      'showPendingButton',
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.authorizeButton.addEventListener('click', authorize);
    els.signoutButton.addEventListener('click', signOut);
    els.loadSpreadsheetButton.addEventListener('click', loadSpreadsheetFromInput);
    els.reloadButton.addEventListener('click', reloadSelectedSpreadsheet);
    els.saveTemplateButton.addEventListener('click', saveTemplate);
    els.showAllButton.addEventListener('click', () => setFilter('all'));
    els.showPendingButton.addEventListener('click', () => setFilter('pending'));

    [els.subjectTemplate, els.bodyTemplate, els.signatureTemplate].forEach((el) => {
      el.addEventListener('input', renderPreview);
    });
  }

  function waitForGoogleLibraries() {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.google && window.google.accounts && window.gapi) {
        window.clearInterval(timer);
        loadGoogleApiClient();
        return;
      }

      if (Date.now() - startedAt > 10000) {
        window.clearInterval(timer);
        setNotice('Google APIライブラリを読み込めませんでした。ネットワークまたは広告ブロック設定を確認してください。');
      }
    }, 100);
  }

  function loadGoogleApiClient() {
    window.gapi.load('client', async () => {
      try {
        if (!isConfigReady()) {
          state.librariesReady = true;
          updateUiState();
          return;
        }

        await window.gapi.client.init({
          discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });

        state.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CONFIG.googleClientId,
          scope: SCOPES,
          hd: getHostedDomainHint(),
          callback: handleTokenResponse,
        });

        state.librariesReady = true;
        updateUiState();
      } catch (error) {
        setNotice('Google APIの初期化に失敗しました: ' + error.message);
      }
    });
  }

  function authorize() {
    if (!isConfigReady()) {
      setNotice('先に config.js の googleClientId を設定してください。');
      return;
    }

    if (!state.librariesReady || !state.tokenClient) {
      setNotice('Google APIを準備中です。少し待ってからもう一度試してください。');
      return;
    }

    state.tokenClient.requestAccessToken({ prompt: state.accessToken ? '' : 'consent' });
  }

  async function handleTokenResponse(response) {
    if (response.error) {
      setNotice('Google認証に失敗しました: ' + response.error);
      return;
    }

    state.accessToken = response.access_token;
    window.gapi.client.setToken({ access_token: state.accessToken });

    try {
      state.user = await fetchGoogleUser();
      if (!isAllowedUser(state.user.email)) {
        signOut(false);
        setNotice('このGoogleアカウントは、このページの利用許可対象ではありません。会社のGoogleアカウントでログインしてください。');
        return;
      }
      loadTemplate();
      updateUiState();
      renderPreview();
    } catch (error) {
      setNotice('ログイン情報を取得できませんでした: ' + error.message);
    }
  }

  async function fetchGoogleUser() {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: 'Bearer ' + state.accessToken,
      },
    });

    if (!response.ok) {
      throw new Error('userinfo API error');
    }

    return response.json();
  }

  function isAllowedUser(email) {
    const allowedEmails = Array.isArray(CONFIG.allowedEmails) ? CONFIG.allowedEmails : [];
    const allowedDomains = Array.isArray(CONFIG.allowedDomains) ? CONFIG.allowedDomains : [];
    const normalizedEmail = String(email || '').toLowerCase();

    if (allowedEmails.length > 0) {
      return allowedEmails.map((item) => item.toLowerCase()).includes(normalizedEmail);
    }

    if (allowedDomains.length > 0) {
      return allowedDomains.some((domain) => {
        return normalizedEmail.endsWith('@' + String(domain).toLowerCase().replace(/^@/, ''));
      });
    }

    return true;
  }

  function getHostedDomainHint() {
    const allowedDomains = Array.isArray(CONFIG.allowedDomains) ? CONFIG.allowedDomains : [];
    if (allowedDomains.length !== 1) {
      return undefined;
    }

    return String(allowedDomains[0]).replace(/^@/, '');
  }

  function signOut(revokeToken) {
    if (revokeToken !== false && state.accessToken && window.google) {
      window.google.accounts.oauth2.revoke(state.accessToken);
    }

    state.accessToken = '';
    state.user = null;
    state.spreadsheet = null;
    state.rows = [];
    state.selectedRowIndex = 0;
    window.gapi.client.setToken(null);
    setDefaultTemplate();
    updateUiState();
    renderPreview();
  }

  function loadSpreadsheetFromInput() {
    if (!state.accessToken) {
      setNotice('先にGoogleログインをしてください。');
      return;
    }

    const spreadsheetId = extractSpreadsheetId(els.spreadsheetInput.value);
    if (!spreadsheetId) {
      setNotice('スプレッドシートURL、またはスプレッドシートIDを入力してください。');
      return;
    }

    state.spreadsheet = {
      id: spreadsheetId,
      name: spreadsheetId,
    };
    els.selectedFileName.textContent = spreadsheetId;
    readAllowedSheet();
  }

  function reloadSelectedSpreadsheet() {
    if (!state.spreadsheet) {
      return;
    }
    readAllowedSheet();
  }

  async function readAllowedSheet() {
    setLoading(true);

    try {
      const spreadsheet = await window.gapi.client.sheets.spreadsheets.get({
        spreadsheetId: state.spreadsheet.id,
        fields: 'properties.title,sheets.properties.title',
      });
      const sheetTitles = spreadsheet.result.sheets.map((sheet) => sheet.properties.title);
      state.spreadsheet.name = spreadsheet.result.properties.title || state.spreadsheet.id;
      els.selectedFileName.textContent = state.spreadsheet.name;

      if (!sheetTitles.includes(SHEET_NAME)) {
        throw new Error('選択したブックに「' + SHEET_NAME + '」シートがありません。');
      }

      const range = "'" + SHEET_NAME.replace(/'/g, "''") + "'!A:Z";
      const valuesResponse = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: state.spreadsheet.id,
        range: range,
      });

      state.rows = parseRecipientRows(valuesResponse.result.values || []);
      state.selectedRowIndex = 0;
      els.loadSummary.textContent = state.rows.length + '件を読み込みました';
      renderPreview();
    } catch (error) {
      state.rows = [];
      els.loadSummary.textContent = '読み込み失敗';
      setNotice(getErrorMessage(error));
      renderPreview();
    } finally {
      setLoading(false);
    }
  }

  function parseRecipientRows(values) {
    if (values.length === 0) {
      throw new Error('「' + SHEET_NAME + '」シートが空です。');
    }

    const headers = values[0].map((header) => String(header).trim());
    const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

    if (missingHeaders.length > 0) {
      throw new Error('必要な列がありません: ' + missingHeaders.join(' / '));
    }

    const rows = values.slice(1).map((row, index) => {
      const record = {};
      headers.forEach((header, headerIndex) => {
        record[header] = row[headerIndex] || '';
      });
      record.__rowNumber = index + 2;
      record.__recipientName = buildRecipientName(record['氏名']);
      return record;
    });

    return rows.filter((row) => {
      return row['会社名'] || row['氏名'] || row['メールアドレス'] || row['ステータス'];
    });
  }

  function buildRecipientName(name) {
    const trimmedName = String(name || '').trim();
    return trimmedName ? trimmedName + ' 様' : 'ご担当者様';
  }

  function setDefaultTemplate() {
    els.subjectTemplate.value = DEFAULT_TEMPLATE.subject;
    els.bodyTemplate.value = DEFAULT_TEMPLATE.body;
    els.signatureTemplate.value = DEFAULT_TEMPLATE.signature;
  }

  function loadTemplate() {
    const saved = window.localStorage.getItem(getTemplateStorageKey());
    if (!saved) {
      setDefaultTemplate();
      return;
    }

    try {
      const template = JSON.parse(saved);
      els.subjectTemplate.value = template.subject || DEFAULT_TEMPLATE.subject;
      els.bodyTemplate.value = template.body || DEFAULT_TEMPLATE.body;
      els.signatureTemplate.value = template.signature || DEFAULT_TEMPLATE.signature;
    } catch (error) {
      setDefaultTemplate();
    }
  }

  function saveTemplate() {
    if (!state.user) {
      setNotice('テンプレート保存にはGoogleログインが必要です。');
      return;
    }

    const template = {
      subject: els.subjectTemplate.value,
      body: els.bodyTemplate.value,
      signature: els.signatureTemplate.value,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(getTemplateStorageKey(), JSON.stringify(template));
    setNotice('テンプレートを保存しました。', 'success');
  }

  function getTemplateStorageKey() {
    const email = state.user ? state.user.email : 'anonymous';
    return 'gmail-draft-prep-template:' + email;
  }

  function renderPreview() {
    const rows = getVisibleRows();
    const hasRows = rows.length > 0;

    els.emptyState.hidden = hasRows;
    els.previewContent.hidden = !hasRows;

    if (!hasRows) {
      els.previewSummary.textContent = state.rows.length === 0
        ? '宛先データを読み込むと表示されます。'
        : '表示対象の宛先がありません。';
      els.recipientTableBody.innerHTML = '';
      els.previewTo.textContent = '-';
      els.previewSubject.textContent = '-';
      els.previewBody.textContent = '';
      return;
    }

    if (state.selectedRowIndex >= rows.length) {
      state.selectedRowIndex = 0;
    }

    const pendingCount = state.rows.filter((row) => isPending(row)).length;
    els.previewSummary.textContent = '全' + state.rows.length + '件 / 未送信' + pendingCount + '件';

    els.recipientTableBody.innerHTML = '';
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.className = index === state.selectedRowIndex ? 'selected' : '';
      tr.tabIndex = 0;
      tr.addEventListener('click', () => {
        state.selectedRowIndex = index;
        renderPreview();
      });
      tr.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.selectedRowIndex = index;
          renderPreview();
        }
      });

      [
        row['会社名'] || '-',
        row.__recipientName,
        row['メールアドレス'] || '-',
        row['ステータス'] || '未送信',
      ].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      els.recipientTableBody.appendChild(tr);
    });

    const selectedRow = rows[state.selectedRowIndex];
    const rendered = renderMail(selectedRow);
    els.previewTo.textContent = selectedRow['メールアドレス'] || '-';
    els.previewSubject.textContent = rendered.subject;
    els.previewBody.textContent = rendered.body;
  }

  function renderMail(row) {
    return {
      subject: applyTemplate(els.subjectTemplate.value, row),
      body: applyTemplate(els.bodyTemplate.value, row),
    };
  }

  function applyTemplate(template, row) {
    return String(template || '')
      .split('{{会社名}}').join(row['会社名'] || '')
      .split('{{氏名}}').join(row['氏名'] || '')
      .split('{{宛名}}').join(row.__recipientName)
      .split('{{署名}}').join(els.signatureTemplate.value || '');
  }

  function setFilter(filter) {
    state.filter = filter;
    state.selectedRowIndex = 0;
    els.showAllButton.classList.toggle('active', filter === 'all');
    els.showPendingButton.classList.toggle('active', filter === 'pending');
    renderPreview();
  }

  function getVisibleRows() {
    if (state.filter === 'pending') {
      return state.rows.filter((row) => isPending(row));
    }
    return state.rows;
  }

  function isPending(row) {
    const status = String(row['ステータス'] || '').trim();
    return !status || status === '未送信' || status === '未作成';
  }

  function setLoading(isLoading) {
    els.reloadButton.disabled = isLoading || !state.spreadsheet;
    els.loadSpreadsheetButton.disabled = isLoading || !state.accessToken;
    els.loadSummary.textContent = isLoading ? '読み込み中...' : els.loadSummary.textContent;
  }

  function updateUiState() {
    const loggedIn = Boolean(state.user && state.accessToken);
    els.accountStatus.textContent = loggedIn ? state.user.email : '未ログイン';
    els.authorizeButton.textContent = loggedIn ? '再認証' : 'Googleでログイン';
    els.signoutButton.hidden = !loggedIn;
    els.loadSpreadsheetButton.disabled = !loggedIn;
    els.reloadButton.disabled = !loggedIn || !state.spreadsheet;
    els.saveTemplateButton.disabled = !loggedIn;
    els.selectedFileName.textContent = state.spreadsheet ? state.spreadsheet.name : '未選択';
    els.loadSummary.textContent = state.rows.length ? state.rows.length + '件を読み込みました' : '-';
  }

  function showConfigWarningIfNeeded() {
    if (isConfigReady()) {
      els.configWarning.hidden = true;
      return;
    }

    els.configWarning.hidden = false;
    els.configWarning.textContent = 'config.js に Google OAuth Client ID を設定してください。';
  }

  function isConfigReady() {
    return CONFIG.googleClientId
      && !CONFIG.googleClientId.includes('YOUR_GOOGLE_OAUTH_CLIENT_ID')
  }

  function extractSpreadsheetId(input) {
    const value = String(input || '').trim();
    if (!value) {
      return '';
    }

    const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      return match[1];
    }

    if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) {
      return value;
    }

    return '';
  }

  function setNotice(message, type) {
    els.configWarning.hidden = false;
    els.configWarning.className = type === 'success' ? 'notice success' : 'notice warning';
    els.configWarning.textContent = message || 'エラー内容を取得できませんでした。ブラウザの開発者ツールでConsoleを確認してください。';
  }

  function getErrorMessage(error) {
    if (!error) {
      return '';
    }

    if (error.result && error.result.error) {
      const apiError = error.result.error;
      return [
        apiError.message,
        apiError.status ? 'status: ' + apiError.status : '',
        apiError.code ? 'code: ' + apiError.code : '',
      ].filter(Boolean).join('\n');
    }

    if (error.body) {
      try {
        const body = JSON.parse(error.body);
        if (body.error && body.error.message) {
          return body.error.message;
        }
      } catch (parseError) {
        return error.body;
      }
    }

    return error.message || String(error);
  }

}());
