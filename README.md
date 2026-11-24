# 英語 to カタカナ 変換器

英文を入力すると、米国英語の発音を基にしたカタカナ表記と強拍・弱拍を表示するWebアプリです。

- 強拍と弱い語句を文字の大きさ・濃さで区別
- 動詞と述語形容詞を着色
- 弱形・音素の連結・子音とYの融合・米国英語の弾き音を考慮した近似表記
- 拍の手動調整、IPAの表示、全文の音声再生
- スマートフォン・ダークモード対応

入力と同時に発音を解析します。大きい文字は強拍、小さい文字は弱い語句、青色は動詞・述語形容詞を表します。発音は自然な会話で起こり得る近似であり、実際の話者や強調によって異なります。

発音・拍の解析はブラウザ内で完結します。音声再生には Google Cloud Text-to-Speech（Chirp 3: HD）を使用します。

## 構成

| 技術 | 用途 |
| --- | --- |
| JavaScript | 英文・発音・品詞・拍の解析 |
| CMU Pronouncing Dictionary / TextBlob | 発音辞書・品詞辞書 |
| Cloudflare Workers / Static Assets | API・静的ファイルの配信 |
| Cloudflare D1 | IP別レート制限・月間利用量の管理 |
| Google Cloud Text-to-Speech | 全文の読み上げ |

辞書は音素と品詞を短い符号に変換したJSONとして配信し、必要な単語だけ復号します。辞書のファイル名には内容のハッシュを含め、ブラウザで長期キャッシュできるようにしています。解析は外部の辞書APIを使用しません。

## ローカル開発

Node.js 22.13以上が必要です。

```sh
npm install
npm test
npm run db:local
npm run dev
```

`wrangler.toml` のD1設定には有効なデータベースIDを設定してください。ローカルでは実際の音声生成を行わなくても発音解析を利用できます。実音声のテストには、本番と分離されたGoogle CloudプロジェクトおよびD1を使用し、認証情報を `.dev.vars` などWranglerのローカル用Secretに設定してください。

## デプロイ

### Google Cloud

Google Cloudのプロジェクトを作成し、請求先を設定します。Google Cloud CLIで以下を実行します。

```sh
PROJECT_ID="YOUR_PROJECT_ID"
gcloud auth login
gcloud services enable texttospeech.googleapis.com --project="$PROJECT_ID"
gcloud iam service-accounts create eng2kana --project="$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:eng2kana@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

サービスアカウントの秘密鍵はリポジトリの外に保存します。組織ポリシーで鍵の発行が禁止されている場合は、管理者と相談して鍵なし認証などを検討してください。

```sh
umask 077
KEY_FILE="$HOME/eng2kana-google-tts.json"
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="eng2kana@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="$PROJECT_ID"
```

### Cloudflare Workers

```sh
npm install
npx wrangler login
npx wrangler d1 create eng2kana-usage
```

`wrangler.toml` の `database_id` と `GOOGLE_CLOUD_PROJECT` を自分の設定に変更します。D1のバインディング名は `DB` にしてください。WranglerがD1設定を自動追加した場合は重複を解消してください。

```sh
npm run db:remote
node scripts/create-secrets.mjs "$KEY_FILE"
npm run deploy -- --secrets-file secrets.production.json
```

`secrets.production.json` に含まれる情報はすべて秘密情報です。安全な場所で管理し、GitHubや公開ディレクトリに置かないでください。デプロイ後の不要なコピーは削除してください。

独自ドメインを使用する場合は `wrangler.toml` に次の設定を追加し、再デプロイします。

```toml
[[routes]]
pattern = "eng2kana.example.com"
custom_domain = true
```

### GitHub連携

このディレクトリをGitリポジトリのルートとして公開できます。Googleの秘密鍵、WranglerのローカルSecret、データベースファイルなどはコミットしないでください。GitHub Actionsでは自動テストのみを実行し、秘密情報は必要ありません。

自動デプロイを使用する場合は、CloudflareのWorkers BuildsからGitHubリポジトリを接続します。対象Worker名を `wrangler.toml` の `name` と一致させ、ルートディレクトリをリポジトリのルート、ビルドコマンドを `npm test`、デプロイコマンドを `npm run deploy` に設定します。D1は初回に手動で作成・マイグレーションし、秘密情報はWorkerのSecretsに登録してください。本番の音声生成用Secretをプレビュー環境と共有しないでください。

## 音声生成の利用制限

| 設定 | 既定値 |
| --- | ---: |
| IP単位の音声生成回数 | 5回 / 60秒 |
| IP単位の入力容量 | 10,000バイト / 60秒 |
| 1リクエストの最大文字数 | 1,000文字 |
| 月間音声生成文字数 | 950,000文字 |

アプリ独自の全利用者合計の毎分制限や同時処理数制限はありません。Cloudflare・Google Cloudのサービス側の制限は適用されます。

`wrangler.toml` の `[vars]` で設定できます。

| 変数 | 用途 |
| --- | --- |
| `GOOGLE_CLOUD_PROJECT` | Google CloudプロジェクトID |
| `GOOGLE_TTS_VOICE` | 米国英語のChirp 3: HD音声 |
| `TTS_IP_REQUESTS_PER_MINUTE` | IP単位の毎分回数 |
| `TTS_IP_BYTES_PER_MINUTE` | IP単位の毎分UTF-8バイト数 |
| `TTS_MAX_CHARS_PER_REQUEST` | 1回の音声生成文字数上限（1〜6,000） |
| `TTS_MONTHLY_CHAR_LIMIT` | 月間文字数上限（0〜1,000,000、0で停止） |
| `TTS_EXTERNAL_MONTHLY_CHARS` | 他のサービスで使用する文字数の確保 |

月間使用量は米国太平洋時間で集計します。Googleへのリクエストを発行する前にD1で利用量を確保し、上限到達後は新規音声生成を停止します。音声生成結果が失敗した場合も課金の可能性を考慮して予約量は戻しません。D1の月間集計を削除すると使用量が失われるため、継続して同じデータベースを使用してください。

月間上限は本アプリの独自集計であり、Google Cloud全体の課金停止を保証するものではありません。無料枠を共有する他サービスの使用量は `TTS_EXTERNAL_MONTHLY_CHARS` で考慮し、[Googleの料金表](https://cloud.google.com/text-to-speech/pricing) に合わせて設定を見直してください。

### 管理者用Secret

以下はWorkerのSecretsとして設定します。

| 変数 | 用途 |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Googleのサービスアカウント認証情報 |
| `TTS_IP_HASH_KEY` | IP識別子生成用の秘密鍵（64桁の16進文字列・必須） |
| `TTS_ADMIN_BYPASS_KEY` | IP別レート制限の解除用キー（任意） |

管理者は `https://公開先/#bypass=YOUR_KEY` を使用するとIP別制限を解除できます。文字数制限・月間制限は解除できません。キーはアドレスバーから取り除かれ、メモリ内に保持されます。URLクエリ `?bypass=YOUR_KEY` にも対応しますが、ログに残り得るためフラグメント形式を推奨します。

月間使用量を確認するには次のAPIを利用します。

```sh
curl https://YOUR_HOST/api/tts/usage \
  -H "X-TTS-Bypass: $TTS_ADMIN_BYPASS_KEY"
```

## プライバシー

IPアドレスは秘密鍵付きHMAC-SHA256で識別子に変換してから保存します。生のIPアドレス・入力英文・生成音声はアプリのデータベースに保存しません。レート制限の期限切れ記録は定期的に削除されます。音声生成時のみ英文がGoogle Cloudへ送信されます。

詳細は [プライバシーポリシー](public/privacy.html) を参照してください。

## 参考資料・ライセンス

- [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict)
- [TextBlob](https://github.com/sloria/TextBlob) / [Pattern](https://github.com/clips/pattern)
- [『怖いくらい通じるカタカナ英語の法則』法則編](https://bluebacks.kodansha.co.jp/books/9784062579872/appendix/theory/)

辞書データの著作権表示およびライセンスは [dictionary-notices.txt](public/dictionary-notices.txt) に記載しています。アプリ本体の利用許諾は別途定めるものとし、辞書のライセンスとは区別します。

## 制作者

エイビー [@s__hrimp](https://twitter.com/s__hrimp)
