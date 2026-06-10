---
name: progress
description: 実装フェーズの進捗状況(設計ドキュメント_v1.mdのPhase 1〜7に対応)
metadata:
  type: project
---

実装フェーズの進捗。詳細な計画は docs/設計ドキュメント_v1.md の「10. 実装フェーズ計画」を参照。

**Why:** 7フェーズの長期実装のため、セッションをまたいで現在地を把握する必要がある。

**How to apply:** フェーズ完了ごとにこのファイルを更新する。1フェーズ=1コミット以上の粒度でgit管理する。

## 状況(2026-06-11時点)

- [x] Phase 1: 基盤構築 — 完了 (コミット 159a413)
  - Vite+React+TS+Tailwind / Express+TS+Prisma / docker-compose 疎通確認済み
  - create-vite最新版はNode 21非対応のため `npm create vite@5` を使用した
- [x] Phase 2: カード一覧 + デッキ保存 — 完了 (コミット a62afd5)
  - /cards(フィルター・検索・ソート・詳細モーダル)、/my-decks(CRUD)
  - /api/decks CRUD一式(20枚固定・上限10デッキのバリデーション)動作確認済み
  - 注意: PrismaはAlpine非互換 → backendはnode:20-slim + binaryTargets指定
  - 注意: backendのnode_modulesは匿名ボリューム。依存変更時は
    `docker compose up -d --force-recreate --renew-anon-volumes backend` が必要
- [x] Phase 3: パック開封 + デッキ構築 — 完了 (コミット d51d4e8)
  - /api/packs/open(封入ルール・UR率1/4検証済み)、/pack-opening、/deck-builder
  - SavedDeck.poolCardIds追加: デッキ編集時に元の40枚プールから選び直せる
  - パック自由枠はN魔法・罠全7種からランダム(設計ドキュメントも修正済み)
- [x] Phase 4: ゲームエンジン + CPU戦 — 完了 (コミット 54ccdcd)
  - engine/gameEngine.ts: 純粋関数+immer。pending機構(trapPrompt/effectTarget)で
    罠割り込みと対象選択をUI/CPU共通のステートマシンにしている
  - 検証は frontend/scripts/simulate.ts (CPU総当たり自動対戦)。
    `npx tsx scripts/simulate.ts 500` で実行。エンジン変更時は必ず回すこと
  - 注意: winner は PlayerIdx(0|1) なので truthy判定禁止。undefined比較を使う
  - 課題(Phase 7で調整): 難易度間の勝率差が小さい(easy vs hard ≒ 48-52)。
    シールド戦の引きの分散が大きいため。AI閾値のチューニング余地あり
- [ ] Phase 5: PvP
- [ ] Phase 6: ドラフト
- [ ] Phase 7: 仕上げ

## 環境メモ

- ホストのNodeは v21.0.0(create-viteの最新が動かない)。DockerコンテナはNode 20を使用
- 起動: `docker compose up -d` → フロント http://localhost:3000 / バック http://localhost:4000
- Vite開発サーバが /api と /socket.io を backend:4000 へプロキシする([[project-overview]])
