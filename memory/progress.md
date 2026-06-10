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
- [ ] Phase 3: パック開封 + デッキ構築
- [ ] Phase 4: ゲームエンジン + CPU戦
- [ ] Phase 5: PvP
- [ ] Phase 6: ドラフト
- [ ] Phase 7: 仕上げ

## 環境メモ

- ホストのNodeは v21.0.0(create-viteの最新が動かない)。DockerコンテナはNode 20を使用
- 起動: `docker compose up -d` → フロント http://localhost:3000 / バック http://localhost:4000
- Vite開発サーバが /api と /socket.io を backend:4000 へプロキシする([[project-overview]])
