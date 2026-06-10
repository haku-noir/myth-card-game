---
name: project-overview
description: 神話カードゲームWebアプリ「レベル&リリース」の全体概要と技術スタック
metadata:
  type: project
---

カードゲームWebアプリ「レベル&リリース（仮称）」をDockerで構築する。

**Why:** ルールブック_v1.md・カードリスト_v1.mdが既に存在し、そこからWebアプリを実装する。

**How to apply:** 実装時は設計ドキュメント_v1.mdを参照する。カードIDはN01〜N25、R01〜R12、SR1〜SR8、UR1〜UR3の形式。

## 技術スタック
- フロントエンド: React + TypeScript + Vite + Tailwind CSS + Zustand
- バックエンド: Node.js + Express + TypeScript + Socket.io
- DB: SQLite + Prisma
- Docker: docker-compose でフロント(port:3000) / バック(port:4000) を分離

## ゲームルール概要
- 初期ライフ6000、先攻レベル1スタート・後攻レベル2スタート
- 毎ターン開始時レベル+1、レベル以下の星のモンスターを召喚可
- リリース（場のモンスターを墓地送り）で(自レベル+リリースした星)以下のモンスターを召喚可
- チェーン処理なし、罠は1枚だけ割り込み可
- 場: モンスター最大5体、罠最大3枚

## 実装モード
- CPU戦（難易度3段階: 易/普通/難）
- PvP（オンライン/ルームコード方式、N人対応設計、現在は2人固定）
- シールド戦ドラフト
- ブースタードラフト（1枚取って左に回す、2人用、4パック、N人対応設計）

## デッキ保存機能
作成済みデッキをSQLiteに保存。パック開封をスキップして保存デッキでゲーム開始可能。
上限10デッキ。CRUD API: /api/decks

## カード画像
現在なし。/public/images/cards/{cardId}.png に配置すれば自動適用される設計。
