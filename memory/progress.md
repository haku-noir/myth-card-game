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
  - 注意: frontend/backendともnode_modulesは匿名ボリューム。package.jsonに
    依存を追加したら `docker compose build <svc>` →
    `docker compose up -d --force-recreate --renew-anon-volumes <svc>` が必要
    (Phase 4のimmer追加でfrontendが実際にこれで落ちた)
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
- [x] Phase 5: PvP — 完了 (コミット d15d54c)
  - ホスト権威方式: サーバーは中継のみ、ホストクライアントがエンジン実行
  - Board共通化(components/game/Board.tsx, mySeat+act(action)方式)
  - 検証: frontend/scripts/pvp-smoke.ts (socket.io 2クライアントのヘッドレステスト)
  - 既知の制限: ゲストもdevtoolsで相手手札を覗ける(friend-play前提で許容)
  - 注意: macOSのDockerバインドマウントでtsx watchが変更を取りこぼすことがある。
    backend更新が反映されない時は `docker compose restart backend`
- [x] Phase 6: ドラフト — 完了 (コミット a1c038b)
  - ルーム基盤を3モード(pvp/sealed/booster)対応に拡張
  - ブースタードラフトはサーバー権威(4ラウンド×10ピック=40枚→20枚構築)
  - 検証: frontend/scripts/draft-smoke.ts
- [ ] Phase 7: 仕上げ
- [x] v1.4アップデート — 完了 (2026-06-12, コミット 7661f82〜)
  - ルール: ライフ8000 / 召喚1回 / ぴったりブースト / 可変星 / 戦闘強化 / 期限付きバフ
  - カード53種(ID移動: 鬼退治SR9・落とし穴SR10・神隠しR14・天罰UR4・アイギスUR5)
  - 保存デッキはmigrate-deck-ids.tsで移行済み
  - 検証: 500ゲーム正常、easy vs hard = 26-74、PvP/ドラフト回帰OK
  - ゲーム名は「星の階」に変更済み
- [ ] v1.5.2実験(採用未定) — ブランチ v1.5.2-summon-unification で実装済み
  - ブースト召喚を召喚に統合: リリースは「星を生み出す」資源、レベル+星
    「以下」の星を召喚可(ぴったり廃止)。可変星は最大値固定
  - 計測: リリース召喚2.3回/試合(2倍)、UR2割増、難易度序列維持。
    ただし先攻勝率44.1%(v1.5の47.5%から悪化)→ 採用時は先攻ライフ補償を検討
  - ユーザーのテストプレイ後に採用判断。mainは v1.5 のまま
- [x] v1.5アップデート — 完了 (コミット 2f42ed2, 9556f91, b7e0905)
  - ブースト召喚の手札リリースを供物3種(豆狸N04/人魚姫N08/一反木綿N16,
    handReleasable)限定に。エンジン2箇所(releaseOptionsFor候補+summon検証)
  - 副作用: 壁メタ化でhardが膠着しnormalに逆転 → 守備表示相手への
    安全マージン要求を撤廃して回復(51.5%/2400戦)。教訓: 守備表示への攻撃に
    返り討ちは無いので慎重ロジックの適用は攻撃表示相手のみが正しい
  - 計測ツール: simulate.tsに対戦カード絞り込み引数、scripts/diag.ts新設。
    勝率の有意差判断は600戦以上で(100〜200戦は±7ptぶれる)
- [x] CPU戦シールド戦 + おまかせ構築 — 完了 (コミット 40514fa, cbcfc33)
  - CPU戦の使用デッキ選択に「シールド戦」: /pack-opening?battle=cpu&difficulty=...
    で開封→構築→保存なしで対戦開始(DeckBuilderのhandleSealedStart)
  - デッキ構築の「おまかせ構築」: buildCpuDeckをbuildDeckIndices(インデックス返却)
    に分離して共用(編集モードはcardById共有参照のためインデックス必須)
- [x] CPUアルゴリズムのドキュメント化 — 完了 (コミット 573cb6a)
  - docs/CPUアルゴリズム.md: 全判断ロジックと難易度別閾値の一覧。
    cpu.ts/cpuDeck.tsの閾値を調整したら本ドキュメントも更新すること
- [x] hard CPU改善 — 完了 (コミット 0c2d2d4)
  - ユーザー指摘「強化込み攻撃が返り討ちの原因」を反映:
    安全マージン600(伏せ有り700)、リアクション不能時のみ強化込み攻撃、
    壁モード(打点が600以上届かない時は守備召喚)、デッキ切れ間際の強行弁
  - normal vs hard = 52〜54%でhard勝ち越しに改善(従来42%)。難易度序列が正常化

## 環境メモ

- ホストのNodeは v21.0.0(create-viteの最新が動かない)。DockerコンテナはNode 20を使用
- 起動: `docker compose up -d` → フロント http://localhost:3000 / バック http://localhost:4000
- Vite開発サーバが /api と /socket.io を backend:4000 へプロキシする([[project-overview]])
