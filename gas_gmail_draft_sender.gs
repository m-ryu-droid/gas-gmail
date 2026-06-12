const SHEET_NAMES = {
  recipients: '宛先リスト',
  settings: '設定',
  template: '本文テンプレート',
};

const RECIPIENT_HEADERS = [
  '送信対象',
  '会社名',
  '氏名',
  'メールアドレス',
  '件名',
  'ステータス',
  '下書き作成日時',
  '下書きID',
  'エラー内容',
];

const STATUS = {
  draftCreated: '下書き作成済み',
  error: 'エラー',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('メール下書き作成')
    .addItem('初期設定シートを作成', 'setupSheets')
    .addSeparator()
    .addItem('テスト下書き作成', 'createTestDraft')
    .addItem('本番下書き作成', 'createProductionDrafts')
    .addToUi();
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupRecipientsSheet_(ss);
  setupSettingsSheet_(ss);
  setupTemplateSheet_(ss);

  SpreadsheetApp.getUi().alert(
    '初期設定が完了しました。\n「宛先リスト」「設定」「本文テンプレート」を確認してください。'
  );
}

function createTestDraft() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getSettings_(ss);
  const testTo = settings['テスト送信先'];

  if (!testTo || !isValidEmail_(testTo)) {
    SpreadsheetApp.getUi().alert('設定シートの「テスト送信先」に有効なメールアドレスを入れてください。');
    return;
  }

  const template = getTemplate_(ss);
  const target = getFirstTargetRecipient_(ss);

  if (!target) {
    SpreadsheetApp.getUi().alert('宛先リストに「送信対象」がTRUEの行がありません。');
    return;
  }

  const subject = '[TEST] ' + buildSubject_(target, settings);
  const body = buildBody_(template, target);
  const options = buildDraftOptions_(settings);

  GmailApp.createDraft(testTo, subject, body, options);

  SpreadsheetApp.getUi().alert(
    'テスト下書きを1件作成しました。\nGmailの下書きフォルダで内容を確認してください。'
  );
}

function createProductionDrafts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const recipientsSheet = getRequiredSheet_(ss, SHEET_NAMES.recipients);
  const settings = getSettings_(ss);
  const template = getTemplate_(ss);
  const rows = getRecipientRows_(recipientsSheet);
  const targets = rows.filter((row) => row.data['送信対象'] === true && row.data['ステータス'] !== STATUS.draftCreated);

  if (targets.length === 0) {
    ui.alert('下書き作成対象がありません。\n「送信対象」がTRUE、かつ未作成の行を確認してください。');
    return;
  }

  const response = ui.alert(
    '本番下書き作成の確認',
    targets.length + '件のGmail下書きを作成します。\nこの時点では送信されません。続けますか？',
    ui.ButtonSet.OK_CANCEL
  );

  if (response !== ui.Button.OK) {
    return;
  }

  let createdCount = 0;
  let errorCount = 0;

  targets.forEach((row) => {
    try {
      const email = row.data['メールアドレス'];

      if (!isValidEmail_(email)) {
        throw new Error('メールアドレスが不正です: ' + email);
      }

      const subject = buildSubject_(row.data, settings);
      const body = buildBody_(template, row.data);
      const options = buildDraftOptions_(settings);
      const draft = GmailApp.createDraft(email, subject, body, options);

      recipientsSheet.getRange(row.rowNumber, getColumnNumber_('ステータス')).setValue(STATUS.draftCreated);
      recipientsSheet.getRange(row.rowNumber, getColumnNumber_('下書き作成日時')).setValue(new Date());
      recipientsSheet.getRange(row.rowNumber, getColumnNumber_('下書きID')).setValue(draft.getId());
      recipientsSheet.getRange(row.rowNumber, getColumnNumber_('エラー内容')).clearContent();
      createdCount += 1;
    } catch (error) {
      recipientsSheet.getRange(row.rowNumber, getColumnNumber_('ステータス')).setValue(STATUS.error);
      recipientsSheet.getRange(row.rowNumber, getColumnNumber_('エラー内容')).setValue(error.message);
      errorCount += 1;
    }
  });

  ui.alert(
    '処理が完了しました。\n作成: ' + createdCount + '件\nエラー: ' + errorCount + '件\nGmailの下書きフォルダを確認してください。'
  );
}

function setupRecipientsSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_NAMES.recipients);
  sheet.clear();
  sheet.getRange(1, 1, 1, RECIPIENT_HEADERS.length).setValues([RECIPIENT_HEADERS]);
  sheet.getRange(2, 1, 1, RECIPIENT_HEADERS.length).setValues([[
    true,
    'サンプル株式会社',
    '山田 太郎',
    'sample@example.com',
    '',
    '',
    '',
    '',
    '',
  ]]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, RECIPIENT_HEADERS.length);
  sheet.getRange('A2:A').insertCheckboxes();
}

function setupSettingsSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_NAMES.settings);
  sheet.clear();
  sheet.getRange(1, 1, 1, 2).setValues([['項目', '値']]);
  sheet.getRange(2, 1, 5, 2).setValues([
    ['テスト送信先', Session.getActiveUser().getEmail()],
    ['共通件名', 'ご連絡'],
    ['差出人名', ''],
    ['添付ファイルID', ''],
    ['メモ', '添付ファイルIDはGoogleドライブのファイルID。複数ある場合はカンマ区切り。'],
  ]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 2);
}

function setupTemplateSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_NAMES.template);
  sheet.clear();
  sheet.getRange('A1').setValue('本文');
  sheet.getRange('A2').setValue(
    '{{会社名}}\n{{氏名}} 様\n\nいつもお世話になっております。\n\n本文はここに入力してください。\n\nよろしくお願いいたします。'
  );
  sheet.setColumnWidth(1, 700);
  sheet.setRowHeight(2, 220);
  sheet.getRange('A2').setWrap(true);
}

function getSettings_(ss) {
  const sheet = getRequiredSheet_(ss, SHEET_NAMES.settings);
  const values = sheet.getDataRange().getValues();
  const settings = {};

  values.slice(1).forEach((row) => {
    if (row[0]) {
      settings[String(row[0]).trim()] = row[1];
    }
  });

  return settings;
}

function getTemplate_(ss) {
  const sheet = getRequiredSheet_(ss, SHEET_NAMES.template);
  const body = sheet.getRange('A2').getValue();

  if (!body) {
    throw new Error('本文テンプレートのA2セルに本文を入力してください。');
  }

  return String(body);
}

function getFirstTargetRecipient_(ss) {
  const sheet = getRequiredSheet_(ss, SHEET_NAMES.recipients);
  const rows = getRecipientRows_(sheet);
  const target = rows.find((row) => row.data['送信対象'] === true);
  return target ? target.data : null;
}

function getRecipientRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  return values.slice(1).reduce((rows, row, index) => {
    if (!row.some((cell) => cell !== '')) {
      return rows;
    }

    const data = {};
    headers.forEach((header, headerIndex) => {
      data[header] = row[headerIndex];
    });
    rows.push({
      rowNumber: index + 2,
      data: data,
    });
    return rows;
  }, []);
}

function buildSubject_(recipient, settings) {
  const rowSubject = recipient['件名'];
  const commonSubject = settings['共通件名'];
  const subject = rowSubject || commonSubject;

  if (!subject) {
    throw new Error('件名が空です。宛先リストの件名、または設定シートの共通件名を入力してください。');
  }

  return replacePlaceholders_(String(subject), recipient);
}

function buildBody_(template, recipient) {
  return replacePlaceholders_(template, recipient);
}

function replacePlaceholders_(text, recipient) {
  return text
    .split('{{会社名}}').join(recipient['会社名'] || '')
    .split('{{氏名}}').join(recipient['氏名'] || '');
}

function buildDraftOptions_(settings) {
  const options = {};
  const senderName = settings['差出人名'];
  const attachmentIds = settings['添付ファイルID'];

  if (senderName) {
    options.name = String(senderName);
  }

  if (attachmentIds) {
    options.attachments = String(attachmentIds)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id)
      .map((id) => DriveApp.getFileById(id).getBlob());
  }

  return options;
}

function getColumnNumber_(headerName) {
  const index = RECIPIENT_HEADERS.indexOf(headerName);

  if (index === -1) {
    throw new Error('列が見つかりません: ' + headerName);
  }

  return index + 1;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getRequiredSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    throw new Error('シートが見つかりません: ' + name + '。先に「初期設定シートを作成」を実行してください。');
  }

  return sheet;
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
