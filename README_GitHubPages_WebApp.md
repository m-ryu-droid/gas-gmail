# Gmail Draft Prep Web App

GitHub Pagesで公開する、Gmail下書き作成用Webアプリです。

Googleログイン、スプレッドシートURL/IDからの読み込み、`mail_recipients` シート読み込み、テンプレート保存、差し込みプレビュー、Gmail下書き作成までを行います。
メールの直接送信は行いません。

## Gmail署名について

Gmailに設定済みの通常署名は、このアプリで作る下書きには基本的に自動挿入されません。

このアプリはGmail APIで下書きを作成するため、本文はアプリで生成した内容がそのまま入ります。
署名を入れたい場合は、画面の `署名` 欄に入力し、本文テンプレート内の `{{署名}}` に差し込んでください。

## ファイル

```text
index.html
styles.css
app.js
config.js
config.example.js
mail_recipients_sample.csv
```

## config.js

```js
window.APP_CONFIG = {
  googleClientId: 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
  allowedSheetName: 'mail_recipients',
  allowedDomains: ['co-success.jp'],
  allowedEmails: [],
};
```

`allowedDomains` に会社のGoogle Workspaceドメインを入れると、そのドメインのメールアドレスだけアプリ内で許可します。

## Google Cloud側で必要な設定

1. Google Cloud Consoleでプロジェクトを開きます。
2. `Google Sheets API` を有効化します。
3. `Gmail API` を有効化します。
4. OAuthクライアントIDは `ウェブ アプリケーション` で作成します。
5. `承認済みの JavaScript 生成元` にGitHub Pagesのoriginを入れます。

例:

```text
https://YOUR_GITHUB_USER.github.io
```

ローカル確認をする場合:

```text
http://localhost:8000
```

## OAuthのスコープ

このアプリは以下の権限を使います。

```text
openid
email
profile
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/gmail.compose
```

`spreadsheets` は、下書き作成後に `ステータス`、`下書き作成日時`、`エラー内容` を書き戻すために使います。
`gmail.compose` はGmail下書き作成のために使います。

## スプレッドシート

対象シート名:

```text
mail_recipients
```

1行目に以下の列名を入れてください。

```text
会社名
氏名
メールアドレス
ステータス
下書き作成日時
送信日時
エラー内容
```

サンプル:

| 会社名 | 氏名 | メールアドレス | ステータス | 下書き作成日時 | 送信日時 | エラー内容 |
| --- | --- | --- | --- | --- | --- | --- |
| サンプル株式会社 | 山田 太郎 | sample@example.com | 未作成 |  |  |  |
| テスト合同会社 |  | test@example.com | 未作成 |  |  |  |

## ステータス

下書き作成対象:

```text
空欄
未作成
未送信
エラー
```

下書き作成後:

```text
下書き作成済み
```

実際にGmailで送信した後の `送信日時` は、必要に応じて手動で入力してください。

## テンプレート差し込み

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

## 使い方

1. Googleログインします。
2. スプレッドシートURLまたはIDを入力します。
3. `読み込み` を押します。
4. テンプレートと署名を入力します。
5. `テスト下書き作成` を押して、自分宛のテスト下書きを確認します。
6. 問題なければ `未作成分の下書きを作成` を押します。
7. Gmailの下書きフォルダで内容を確認して、手動で送信します。
