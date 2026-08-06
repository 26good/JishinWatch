# 地震監視モニター（QuakeView）

日本国内の地震・緊急地震速報（EEW）・津波情報をリアルタイムに表示する、非公式の地震監視Webアプリです。

> [!IMPORTANT]
> 本アプリは気象庁・国土交通省・国土地理院その他の公的機関が提供する公式サービスではありません。個人がAI（Claude）を活用して開発した非公式アプリです。緊急地震速報・地震情報・津波情報は、必ず気象庁など公式の発表・報道機関の情報もあわせてご確認ください。
> 利用条件・免責事項・各データソースのライセンス条件は [TERMS.md](./TERMS.md) をご覧ください。

## 主な機能

- **地震情報のリアルタイム表示**：[P2P地震情報](https://www.p2pquake.net/)から地震・津波情報を取得し、日本地図上に表示
- **緊急地震速報（EEW）**：[Wolfx](https://wolfx.jp/) 経由でリアルタイムのEEWを受信し、推定震度・警報レベルを表示
- **震度分布マップ**：都道府県ごとの震度チップと、気象庁観測点座標に基づく個別マーカーを地図上に同時表示
- **津波情報**：津波注意報・警報・大津波警報を海岸線に色分け表示（北海道は6つの津波予報区ごとに区分）
- **地震一覧・観測点一覧**：直近の地震履歴と、地震ごとの観測点別震度を一覧表示（取得件数は設定で変更可能）
- **音声・プッシュ通知**：EEW・津波警報時の音声アラートとブラウザ通知
- **現在地の推定震度**：地図クリックで現在地を設定すると、[J-SHIS](https://www.j-shis.bosai.go.jp/) の地盤増幅率を反映した推定震度を表示
- **テストモード**（Shift+T）：震源・マグニチュード（M7以上）・深さをランダム生成した地震シミュレーションで、EEWの連続速報や津波警報の流れを確認できる

## 開発について

本アプリは Replit Agent と Anthropic の Claude（AI）を活用して開発されています。コードの大部分は人間の指示のもとAIが生成・修正したものです。

## 技術スタック

pnpm workspace によるモノレポ構成です。詳細は [replit.md](./replit.md) を参照してください。

- **フロントエンド**：React + TypeScript + Vite、地図表示に Leaflet / React Leaflet
- **API サーバー**：Express 5（現状は雛形のみ）
- **DB**：PostgreSQL + Drizzle ORM（現状は雛形のみ）
- **バリデーション**：Zod
- **API コード生成**：Orval

## セットアップ

> [!NOTE]
> このアプリは Replit 上でのみ開発・運用しており、ローカル環境でのセットアップは想定していません。以下はあくまで一般的なモノレポとしての起動手順の参考です。

```bash
pnpm install
pnpm run typecheck
pnpm --filter @workspace/earthquake-monitor run dev
```

## データ提供元

このアプリは以下の外部データ・APIを利用しています。詳細なクレジットはアプリ内の「利用規約・データ提供元クレジット」（設定パネルから確認可能）、および [TERMS.md](./TERMS.md) を参照してください。

- 地震・津波情報：[P2P地震情報](https://www.p2pquake.net/)（気象庁の情報を二次利用）
- 緊急地震速報：[Wolfx Project](https://wolfx.jp/)（非公式のリアルタイム配信サービス）
- 都道府県境界データ：地球地図日本（[国土地理院](https://www.gsi.go.jp/kankyochiri/gm_jpn.html)）／[dataofjapan/land](https://github.com/dataofjapan/land)
- 市区町村境界データ：国土数値情報（国土交通省）／加工：[スマートニュース メディア研究所](https://github.com/smartnews-smri/japan-topography)
- 地盤増幅率データ：[J-SHIS（防災科学技術研究所）](https://www.j-shis.bosai.go.jp/)
- 震度観測点座標データ：気象庁震度観測点データを基に作成された座標リスト（[iku55氏提供](https://gist.github.com/iku55/79005d1896631ad6117bbe327b8162c1)）

## ライセンス・利用規約

本アプリの利用条件、免責事項、各データソースのライセンス条件については [TERMS.md](./TERMS.md) を参照してください。
