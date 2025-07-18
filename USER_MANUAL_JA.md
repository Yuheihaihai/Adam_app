# ADamアプリ ユーザーマニュアル

## サービス推薦システム

### 概要

ADamアプリは、自然な会話を通じてユーザーのニーズを理解し、それに基づいて関連するサービスを推薦するように設計されています。システムは会話を分析して、就労、メンタルヘルス、社会的つながりなどに関する様々なニーズを特定します。

### 主な機能

#### 1. インテリジェントなサービスマッチング

アプリは会話からユーザーのニーズを自動的に特定し、適切なサービスとマッチングします。主なカテゴリは以下の通りです：

- **メンタルヘルスサポート**：うつ病、不安、ストレス管理に関するサービス
- **キャリアサービス**：就職活動、転職、研修機会
- **社会的サポート**：コミュニティとのつながり、孤立支援、社会的交流
- **経済的支援**：経済的サポート、給付金情報
- **日常生活サポート**：住居、医療アクセス、その他の日常的なニーズ

#### 2. ユーザー設定コントロール

ユーザーは受け取るサービス推薦を完全にコントロールできます：

| コマンド | 説明 | 例 |
|---------|-------------|---------|
| サービス表示オフ | すべてのサービス推薦をオフにする | 「サービス表示オフ」 |
| サービス表示オン | サービス推薦をオンにする | 「サービス表示オン」 |
| サービスオフ | すべてのサービス推薦をオフにする（短縮コマンド） | 「サービスオフ」 |
| サービスオン | サービス推薦をオンにする（短縮コマンド） | 「サービスオン」 |
| サービス数[数字] | 表示されるサービスの数を設定する | 「サービス数2」（2つのサービスを表示） |
| 信頼度[数字] | 最低信頼度レベルを設定する（0-100） | 「信頼度80」（80%の信頼度） |
| サービス設定確認 | 現在の設定を確認する | 「サービス設定確認」 |

#### 3. 文脈理解

システムはサービスに関するユーザーのフィードバックに知的に対応します：

- **[NEW]** 高度なLLM（大規模言語モデル）による文脈理解で、特定のトリガーワードがなくても暗黙的な助けの要求を検出
- **[NEW]** システムはユーザーのメッセージから困難や悩みを認識し、自動的に関連サービスを提供
- ユーザーが「お仕事関係ない」と言った場合、システムは就労サービスの表示を避けます
- 「メンタル」という言葉に言及した場合、システムはメンタルヘルスサービスを優先します
- 困っているユーザーには、最小限のサービス表示形式が使用されます
- システムは特定のサービスカテゴリに対する否定的なフィードバックに適応します

#### 4. 自然言語インタラクション

アプリはユーザーがニーズを表現するさまざまな方法を理解します：

- **[NEW]** 間接的な要求：「これがとても難しくて...」「どうすればいいか分からなくて...」
- **[NEW]** 感情表現：frustration（不満）, worry（心配）, confusion（混乱）などの検出
- 直接的な発言：「仕事関係ない」（仕事に関係ない）
- 問い合わせ：「メンタルについて知りたい」（メンタルヘルスについて知りたい）
- フィードバック：「就職サービスはいらない」（就職サービスは必要ない）

### 会話例

#### 例1：メンタルヘルスの悩み

**ユーザー**：「メンタルやばい」  
**システム応答**：
- メンタルヘルスに関する共感的なメッセージ
- カウンセリングホットラインなどのメンタルヘルスサービスの推薦

#### 例2：キャリアサービスを拒否する

**ユーザー**：「お仕事関係ない」  
**システム応答**：
- ユーザーのフィードバックを認識
- メンタルヘルスや社会的サポートなど他のカテゴリを優先
- キャリア関連のサービスの表示を避ける

#### 例3：設定の調整

**ユーザー**：「サービス数1」  
**システム応答**：
- 設定変更の確認
- 今後の応答では、1つのサービス推薦のみを表示

### 最適な体験のためのヒント

1. **ニーズを具体的に表現する**：状況をより明確に表現するほど、サービスマッチングが向上します
2. **フィードバックを提供する**：推薦が役立たない場合は、システムに知らせてください
3. **異なるフレーズを試す**：ニーズが変化した場合は、より良いマッチングを得るために異なるキーフレーズを使用してみてください
4. **設定を調整する**：上記のコマンドを使用して、体験をカスタマイズしてください

### プライバシーとデータ保護

- すべての会話は安全に処理されます
- 個人情報は適用されるプライバシー法に従って保護されます
- サービス推薦は個人プロファイルではなく、会話分析に基づいています

### X（旧Twitter）共有機能

Adamに対して肯定的なフィードバックをいただいた際に、アプリの共有機能をご利用いただけます。

**機能の特徴:**
- ユーザーがAdamやサービスに高い満足度を示した場合に自動的にX共有リンクを表示
- 単純な「ありがとう」だけでなく、より具体的で肯定的なフィードバックを検出
- AIが文脈を理解し、適切なタイミングでのみ共有を提案
- **[新機能]** 大規模言語モデル（LLM）技術による文脈理解の精度向上
- **[新機能]** 二段階検証プロセスで共有提案の適切性と適時性を確保

**使用方法:**
1. Adamとの会話の中で具体的な肯定的フィードバックを送信（例：「Adamさん、本当に役に立ちました！」）
2. 共有リンクが表示されたら、クリックしてX（旧Twitter）で共有
3. 共有を希望しない場合は、通常通り会話を続行するだけで共有機能は自動的に非表示に

**例:**
- 「Adamさん、あなたの助言はとても役立ちました」
- 「このAIカウンセラーは本当に便利ですね」
- 「Adamのアドバイスのおかげで、問題が解決しました」

**技術的改良点:**
- 大規模言語モデル（GPT-4o-mini）による高度な自然言語理解
- 単なるキーワードではなく、会話の意味を文脈から分析
- APIサービスが利用できない場合の自動フォールバック機能による信頼性向上
- 軽量モデルとスマートキャッシングによる最適化されたパフォーマンス
- 即時応答とバックグラウンド実行によるWebhook処理の強化でタイムアウト問題を防止
- 拡張されたタイムアウト設定（120秒）で複雑なリクエストの確実な処理を実現

### サポート

サービス推薦システムに関する追加のヘルプや質問については、システム管理者にお問い合わせください。 