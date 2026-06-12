# Gmail Draft Prep Web App

GitHub Pagesで公開する、Gmail下書き作成前の確認用Webアプリです。

この段階ではメール下書きの作成や送信は行いません。
Googleログイン、スプレッドシートURL/IDからの読み込み、`mail_recipients` シート読み込み、テンプレート保存、差し込みプレビューまでを行います。

## できること

- Googleアカウントでログイン
- ログインユーザーがアクセスできるGoogleスプレッドシートだけ読み込み
- 入力したブック内の `mail_recipients` シートだけ読み込み
- 宛先一覧をプレビュー
- 件名、本文、署名テンプレートを編集
- ログインユーザーごとにテンプレートをブラウザへ保存
- `氏名` が空欄の場合は `ご担当者様` を自動挿入
- `氏名` がある場合は `氏名 様` を自動挿入

## ファイル

```text
index.html
styles.css
app.js
config.js
config.example.js
```

GitHub Pagesには上記ファイルを置きます。

## config.js

`config.example.js` を参考に、`config.js` を設定します。

```js
window.APP_CONFIG = {
  googleClientId: 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
  allowedSheetName: 'mail_recipients',
  allowedDomains: ['example.co.jp'],
  allowedEmails: [],
};
```

`allowedDomains` に会社のGoogle Workspaceドメインを入れると、そのドメインのメールアドレスだけアプリ内で許可します。

```js
allowedDomains: ['your-company.co.jp'],
```

`allowedEmails` は空配列ならアプリ側ではメールアドレス制限をしません。
個別の人だけ許可したい場合は、次のように指定できます。

```js
allowedEmails: ['person1@your-company.co.jp', 'person2@your-company.co.jp'],
```

メールアドレスをGitHubに置きたくない場合は、Google Cloud側のOAuthテストユーザーで制限してください。

会社の人だけにしたい場合は、Google Cloud側でもOAuth同意画面のユーザータイプを `Internal` にするのが一番安全です。
`Internal` はGoogle Workspace組織内のユーザー向けです。個人Gmailだけの環境では選べません。

## Google Cloud側で必要な設定

1. Google Cloud Consoleでプロジェクトを作成します。
2. Google Sheets APIを有効化します。
3. OAuth Client IDを作成します。
4. アプリ種別は `Web application` を選びます。
5. Authorized JavaScript originsにGitHub PagesのURLを登録します。

API Keyは使いません。
Google Pickerも使わず、スプレッドシートURLまたはIDを画面に貼り付けて読み込みます。

会社のGoogle Workspaceアカウントだけに閉じる場合は、OAuth同意画面のAudienceで `Internal` を選びます。
これにより、会社のGoogle Workspace組織外のGoogleアカウントはOAuth認証を通れません。

例:

```text
https://YOUR_GITHUB_USER.github.io
```

リポジトリのPages URLがサブパスになる場合でも、originにはパスを含めません。

```text
OK: https://YOUR_GITHUB_USER.github.io
NG: https://YOUR_GITHUB_USER.github.io/YOUR_REPOSITORY
```

ローカル確認をする場合は、必要に応じて以下も追加します。

```text
http://localhost:8000
```

## OAuthのスコープ

このアプリは以下の権限を使います。

```text
openid
email
profile
https://www.googleapis.com/auth/spreadsheets.readonly
```

Sheetsは入力されたスプレッドシートの読み込みに使います。
ログインユーザーがアクセス権を持たないスプレッドシートは読み込めません。

## 完全無料で使う場合

この版は、GitHub PagesとGoogle OAuth Client IDだけで動かす想定です。

- GitHub Pagesは無料枠で公開できます。
- Google CloudのOAuth Client ID作成に課金設定は不要です。
- API Keyは不要です。
- Google Sheets APIは読み取りだけに使います。
- この段階ではGmail APIを使わず、メール下書き作成も送信も行いません。

後でGmail下書き作成を追加する場合も、標準的な利用は追加費用なしで使えますが、GoogleのAPI割当や送信制限はあります。

## スプレッドシート

対象シート名は固定です。

```text
mail_recipients
```

1行目に以下の列名を入れてください。

```text
会社名
氏名
メールアドレス
ステータス
送信日時
エラー内容
```

サンプル:

| 会社名 | 氏名 | メールアドレス | ステータス | 送信日時 | エラー内容 |
| --- | --- | --- | --- | --- | --- |
| サンプル株式会社 | 山田 太郎 | sample@example.com | 未送信 |  |  |
| テスト合同会社 |  | test@example.com | 未送信 |  |  |

## テンプレート差し込み

使える差し込み項目です。

```text
{{会社名}}
{{宛名}}
{{氏名}}
{{署名}}
```

`{{宛名}}` は自動生成されます。

```text
氏名あり: 山田 太郎 様
氏名なし: ご担当者様
```

## 保存について

テンプレートは、ログイン中のGoogleメールアドレスごとにブラウザのlocalStorageへ保存されます。

そのため、同じGoogleアカウントでも別PCや別ブラウザでは共有されません。
共有したい場合は、次の段階でGoogle Sheets側にテンプレート保存用シートを追加する設計にできます。

## 次の段階

この画面で読み込みとプレビューが問題なく動いたら、次にGmail APIで下書き作成機能を追加します。
その場合も直接送信ではなく、Gmail下書き作成までに留めるのが安全です。
