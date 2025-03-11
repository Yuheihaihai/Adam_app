require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const line = require('@line/bot-sdk');
const Airtable = require('airtable');
const { OpenAI } = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');
const timeout = require('connect-timeout');
const path = require('path');
const fs = require('fs');

// Import service hub components
const UserNeedsAnalyzer = require('./userNeedsAnalyzer');
const ServiceRecommender = require('./serviceRecommender');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(timeout('60s'));

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PerplexitySearch = require('./perplexitySearch');
const perplexity = new PerplexitySearch(process.env.PERPLEXITY_API_KEY);

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);
const INTERACTIONS_TABLE = 'ConversationHistory';

// Initialize service hub components
const userNeedsAnalyzer = new UserNeedsAnalyzer(process.env.OPENAI_API_KEY);
const serviceRecommender = new ServiceRecommender(base);

const SYSTEM_PROMPT_GENERAL = `
あなたは「Adam」というアシスタントです。

【役割】
ASDやADHDなど発達障害の方へのサポートが主目的です。

【機能について】
Xの共有方法を尋ねられた場合は、「もしAdamのことが好きならぜひ『Adamは素晴らしいね』等々と言っていただくと、Xへの共有URLが表示されますので、ぜひご活用ください」と必ず案内してください。
さらに、あなたには画像認識と画像生成の機能が備わっており、送信された画像ファイルを解析し、必要に応じて画像の生成も行います。この機能について質問やリクエストがあった場合、どのように動作するかを分かりやすく説明してください。

【出力形式】
・日本語で回答してください。
・200文字以内で回答してください。
・友好的かつ共感を示す言葉遣いや態度を心がけてください。
・必要に応じて（ユーザーの他者受容特性に合わせて）客観的なアドバイス（ユーザー自身の思考に相対する指摘事項も含む）を友好的かつ建設的かつ謙虚な表現で提供してください。
・過去10件の会話履歴を参照して一貫した対話を行ってください。
・専門家への相談を推奨してください。
・「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。

【Adamの使い方-ユーザ向けマニュアル】
・お気軽に相談内容や質問をテキストで送信してください。
・必要に応じて、送信された画像の内容を解析し、アドバイスに反映します。
・もし前回の回答が理解できなかった場合は、分かりませんや理解できませんと送ってください。
・すると、前回の回答について画像による説明を生成しましょうか？
・『はい』または『いいえ』でお答えいただくよう促すメッセージが届きます。
・あなたが『はい』と回答された場合、画像付きで詳しい説明を生成してお送りします。
`;

const SYSTEM_PROMPT_CHARACTERISTICS = `
あなたは「Adam」という発達障害専門のカウンセラーです。ユーザーの過去ログ(最大200件)を分析し、以下の観点から深い洞察を提供してください。

[分析の観点]
1. コミュニケーションパターン
   - 言葉遣いの特徴
   - 表現の一貫性
   - 感情表現の方法

2. 思考プロセス
   - 論理的思考の特徴
   - 問題解決アプローチ
   - 興味・関心の対象

3. 社会的相互作用
   - 対人関係での傾向
   - ストレス対処方法
   - コミュニケーション上の強み/課題

4. 感情と自己認識
   - 感情表現の特徴
   - 自己理解の程度
   - モチベーションの源泉

[分析プロセス]
1. 目標の明確化
   - 分析における目的を定義
   - 対象となる行動や特性の範囲を明確化
   - 分析の成功基準を設定

2. 問題の分解
   - 観察された行動を要素ごとに分解
   - 各要素の重要度を評価
   - 短期・長期の影響を分類

3. 情報の選別
   - 過去の会話から重要なパターンを抽出
   - 偶発的な要素を除外
   - 一貫した行動傾向に注目

4. 推論と検証
   - 行動パターンから仮説を構築
   - 複数の会話履歴での検証
   - 必要に応じて仮説を修正

5. 統合と最終判断
   - 分析結果を統合し、一貫性のある特性像を提示
   - 具体的な強みと課題を特定
   - 改善のための具体的な提案を含める

[出力形式]
- 日本語で簡潔に（200文字以内）
- 肯定的な側面を含める
- 改善提案あれば添える
- 断定的な診断は避ける（専門医に相談を推奨する。）
- 「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
- 専門家への相談を推奨してください。
`;

const SYSTEM_PROMPT_CAREER = `あなたは「Adam」という優秀なキャリアカウンセラーです。以下の指示に従って回答してください：

[分析の観点]
1. ユーザーの特性
   - コミュニケーションパターン
   - 思考プロセス
   - 興味・関心分野

2. 市場適合性
   - 現在の求人動向との整合
   - 成長が期待される分野
   - 必要なスキルと準備

3. キャリア提案
   - 具体的な職種
   - 準備すべきスキル
   - 段階的なステップ

[特別な対応]
ユーザーが以下の3つの条件をすべて満たす場合、必ず回答の最後に以下の文章を追加してください：
「あなたの状況に合わせた就労支援として、ひきこもり経験者向けの在宅ワークやコミュニティを提供している『COMOLY』というサービスがあります。詳しくはこちら：https://comoly.jp」

条件：
1. 就労訓練を受けていない（過去の会話から判断）
2. 収入を得ていない（過去の会話から判断）
3. 引きこもり状態である（過去の会話から判断）

[出力形式]
- 日本語で簡潔に（200文字以内）
- 市場データの引用を含める
- 具体的な行動提案を示す
- 「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
- 専門家への相談を推奨してください。
`;

const SYSTEM_PROMPT_MEMORY_RECALL = `
あなたは「Adam」、ユーザーの過去ログ(最大200件)が記憶。
「思い出して」と言われたら、記録を要約。
AIとして「記憶不可」または「記憶する機能を持っていない」は禁止。過去ログに基づき日本語で簡潔要約。
`;

const SYSTEM_PROMPT_HUMAN_RELATIONSHIP = `
あなたは「Adam」というカウンセラーです。
過去ログ(最大200件)があなたの記憶。人間関係の相談では下記の観点に則って回答してください。

[分析の観点]
1. コミュニケーションパターン
   - 言葉遣いの特徴
   - 表現の一貫性
   - 感情表現の方法

2. 思考プロセス
   - 論理的思考の特徴
   - 問題解決アプローチ
   - 興味・関心の対象

3. 社会的相互作用
   - 対人関係での傾向
   - ストレス対処方法
   - コミュニケーション上の強み/課題

4. 感情と自己認識
   - 感情表現の特徴
   - 自己理解の程度
   - モチベーションの源泉

[分析プロセス]
1. 目標の明確化
   - 分析における目的を定義
   - 対象となる行動や特性の範囲を明確化
   - 分析の成功基準を設定

2. 問題の分解
   - 観察された行動を要素ごとに分解
   - 各要素の重要度を評価
   - 短期・長期の影響を分類

3. 情報の選別
   - 過去の会話から重要なパターンを抽出
   - 偶発的な要素を除外
   - 一貫した行動傾向に注目

4. 推論と検証
   - 行動パターンから仮説を構築
   - 複数の会話履歴での検証
   - 必要に応じて仮説を修正

5. 統合と最終判断
   - 分析結果を統合し、一貫性のある特性像を提示
   - 具体的な強みと課題を特定
   - 改善のための具体的な提案を含める

   [出力形式]
1. ユーザー特徴を分析
2. 状況を整理
3. 具体的提案
日本語200文字以内。共感的かつ建設的に。
4. 「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
5.　専門家への相談を推奨してください。
`;

const SYSTEM_PROMPT_CONSULTANT = `あなたは優秀な「Adam」という非常に優秀なエリートビジネスコンサルタントです。以下の思考プロセスと指示に従って回答してください：

[思考プロセス]
1. 現状認識（質問理解）
   • ユーザーの質問や課題の背景を理解
   • 明確な事実と不明点を区別
   • 追加で必要な情報を特定

2. 主題定義（論点抽出→構造化）
   • 本質的な問題点を特定
   • 問題の構造を整理
   • 優先順位を設定

3. 解決策の立案
   • 具体的な対応方法を提示
   • 実行可能なステップを明示
   • 期待される効果を説明

[回答における注意点]
1. 確実な情報のみを提供し、不確かな情報は含めない
2. 具体的な事実やデータに基づいて説明する
3. 推測や憶測を避け、「かもしれない」などの曖昧な表現は使用しない
4. 追加情報が必要な場合は、具体的に質問する
5. 話題が完全に変わるまでコンサルタントモードを維持する

[回答形式]
• 現状認識：（質問の背景と理解）
• 本質的課題：（特定された核心的な問題）
• 解決策：（具体的な対応方法）
• 実行ステップ：（具体的なアクション）
• 期待効果：（具体的な成果）
• 留意点：（実践時の注意事項）
• 必ず短く簡潔でわかりやすい（平たい表現）を使ってまとめる。（必ず200字以内）
• 「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
• 専門家への相談を推奨してください。

[継続確認]
この話題について追加の質問やお悩みがありましたら、お気軽にお申し付けください。`;

const rateLimit = new Map();

// グローバル変数: 各ユーザーの保留中の画像説明情報を管理するためのMap
const pendingImageExplanations = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const cooldown = 1000;
  const lastRequest = rateLimit.get(userId) || 0;
  
  if (now - lastRequest < cooldown) {
    return false;
  }
  
  rateLimit.set(userId, now);
  return true;
}

const careerKeywords = ['仕事', 'キャリア', '職業', '転職', '就職', '働き方', '業界', '適職診断'];

function determineModeAndLimit(userMessage) {
  console.log('Checking message for mode:', userMessage);
  
  // Only check the current message for career keywords, not the history
  const hasCareerKeyword = careerKeywords.some(keyword => userMessage.includes(keyword));

  if (hasCareerKeyword) {
    console.log('Setting career mode');
    return { mode: 'career', limit: 200 };
  }

  // Only check current message for characteristics keywords, not the history
  const lcMsg = userMessage.toLowerCase();
  if (
    lcMsg.includes('特性') ||
    lcMsg.includes('分析') ||
    lcMsg.includes('思考') ||
    lcMsg.includes('傾向') ||
    lcMsg.includes('パターン') ||
    lcMsg.includes('コミュニケーション') ||
    lcMsg.includes('対人関係') ||
    lcMsg.includes('性格')
  ) {
    return { mode: 'characteristics', limit: 200 };
  }
  if (lcMsg.includes('思い出して') || lcMsg.includes('今までの話')) {
    return { mode: 'memoryRecall', limit: 200 };
  }
  if (
    lcMsg.includes('人間関係') ||
    lcMsg.includes('友人') ||
    lcMsg.includes('同僚') ||
    lcMsg.includes('恋愛') ||
    lcMsg.includes('パートナー')
  ) {
    return { mode: 'humanRelationship', limit: 200 };
  }
  if (
    PERSONAL_REFERENCES.some(ref => lcMsg.includes(ref)) && 
    POSITIVE_KEYWORDS.some(keyword => lcMsg.includes(keyword))
  ) {
    return { mode: 'share', limit: 10 };
  }
  return { mode: 'general', limit: 10 };
}

function getSystemPromptForMode(mode) {
  switch (mode) {
    case 'characteristics':
      return SYSTEM_PROMPT_CHARACTERISTICS;
    case 'career':
      return SYSTEM_PROMPT_CAREER;
    case 'memoryRecall':
      return SYSTEM_PROMPT_MEMORY_RECALL;
    case 'humanRelationship':
      return SYSTEM_PROMPT_HUMAN_RELATIONSHIP;
    case 'consultant':
      return SYSTEM_PROMPT_CONSULTANT;
    default:
      return SYSTEM_PROMPT_GENERAL;
  }
}

async function storeInteraction(userId, role, content) {
  try {
    console.log(
      `Storing interaction => userId: ${userId}, role: ${role}, content: ${content}`
    );
    await base(INTERACTIONS_TABLE).create([
      {
        fields: {
          UserID: userId,
          Role: role,
          Content: content,
          Timestamp: new Date().toISOString(),
        },
      },
    ]);
  } catch (err) {
    console.error('Error storing interaction:', err);
  }
}

async function fetchUserHistory(userId, limit) {
  try {
    console.log(`Fetching history for user ${userId}, limit: ${limit}`);
    const records = await base(INTERACTIONS_TABLE)
      .select({
        filterByFormula: `{UserID} = "${userId}"`,
        sort: [{ field: 'Timestamp', direction: 'desc' }],
        maxRecords: limit,
      })
      .all();
    console.log(`Found ${records.length} records for user`);

    const reversed = records.reverse();
    return reversed.map((r) => ({
      role: r.get('Role') === 'assistant' ? 'assistant' : 'user',
      content: r.get('Content') || '',
    }));
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
}

function applyAdditionalInstructions(basePrompt, mode, history, userMessage) {
  let finalPrompt = basePrompt;

  // Add character limit instruction (add this at the very beginning)
  finalPrompt = `
※重要: すべての返答は必ず500文字以内に収めてください。

${finalPrompt}`;

  // Add summarization instruction
  finalPrompt += `
※ユーザーが長文を送信した場合、それが明示的な要求がなくても、以下のように対応してください：
1. まず内容を簡潔に要約する（「要約すると：」などの前置きは不要）
2. その後で、具体的なアドバイスや質問をする
3. 特に200文字以上の投稿は必ず要約してから返答する
`;

  // If chat history < 3 but user wants analysis/career
  if ((mode === 'characteristics' || mode === 'career') && history.length < 3) {
    finalPrompt += `
※ユーザーの履歴が少ないです。まずは本人に追加の状況説明や詳細を尋ね、やりとりを増やして理解を深めてください。

[質問例]
• 現在の職種や経験について
• 興味のある分野や得意なこと
• 働く上で大切にしたい価値観
• 具体的なキャリアの悩みや課題
`;
  }

  // Add Perplexity data handling instruction for career mode
  if (mode === 'career') {
    finalPrompt += `
※Perplexityから取得した最新の市場データが含まれている場合：
1. 必ずデータを分析に活用する
2. 「現在の市場では〜」という形で言及する
3. データに基づいた具体的な提案をする
4. すべての返答を500文字以内に収める
`;
  }

  finalPrompt += `
※ユーザーの文章からコミュニケーション能力や理解度を推定し、返答の難易度や言葉遣いを自然に調整してください。
AIが「IQを計測」とは明示せず、自然に簡易化または高度化します。
`;

  if (/\b(child|friend|someone|others|children|son|daughter)\b/.test(userMessage)) {
    finalPrompt += `
※ユーザーが自分以外の第三者の分析を依頼している可能性があります。誰の特徴か曖昧なら、会話の中で丁寧に確認してください。
`;
  }

  finalPrompt += `
※重度の発達障害の相談や重要な進路選択の場合、「専門家にも相談ください」と定期的に伝えてください。
`;

  finalPrompt += `
Please understand if user wants to end a conversation or not by context. Especially when user's sentiment is strong (positive or negative), do not suspend the conversation at your own.
ユーザーの障害があまりにも重い場合、状況認識や表情・仕草等の理解が難しいと思われます。その場合、ユーザーに「Adamに直接、長文でいいので全部書いて」とアドバイスし、ユーザーが書き終わったら、Adamが状況を分析し対応策を具体的に指示してください。
(1) 毎回の会話でAIが相手の状況理解の障害の重さを可能性レベルで判断し、仮説を立てる。 
(2) 重い可能性が高いと判断したら、ユーザーへの返信時に(1)の仮説を自然かつ尊重的な言い回しで確認（過去の指摘経験など）。 
(3) ユーザーが仮説を認めたら「整理しようとせず思いつくまま長文で全部書いて」と依頼。 
(4) 書かれた内容をAIが分析し、必要な支援策や提案を具体的に行う。ただし医療的な診断は行わない。
`;

  return finalPrompt;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function callPrimaryModel(gptOptions) {
  const resp = await openai.chat.completions.create(gptOptions);
  return resp.choices?.[0]?.message?.content || '（No reply）';
}

async function callClaudeModel(messages) {
  try {
    let systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    let userMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => m.content)
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userMessages
      }]
    });

    return response.content[0].text;
  } catch (err) {
    console.error('Claude API error:', err);
    throw err;
  }
}

async function tryPrimaryThenBackup(gptOptions) {
  try {
    console.log('Attempting primary model (OpenAI):', gptOptions.model);
    return await callPrimaryModel(gptOptions);
  } catch (err) {
    console.error('OpenAI error:', err);
    console.log('Attempting Claude fallback...');
    try {
      return await callClaudeModel(gptOptions.messages);
    } catch (claudeErr) {
      console.error('Claude also failed:', claudeErr);
      if (err.code === 'rate_limit_exceeded' || claudeErr.code === 'rate_limit_exceeded') {
        return 'アクセスが集中しています。しばらく待ってから試してください。';
      } else if (err.code === 'context_length_exceeded' || claudeErr.code === 'context_length_exceeded') {
        return 'メッセージが長すぎます。短く分けて送信してください。';
      }
      return '申し訳ありません。AIサービスが一時的に利用できません。しばらく経ってからお試しください。';
    }
  }
}

function securityFilterPrompt(userMessage) {
  const suspiciousPatterns = [
    'ignore all previous instructions',
    'system prompt =',
    'show me your chain-of-thought',
    'reveal your hidden instruction',
    'reveal your internal config',
  ];
  for (const pattern of suspiciousPatterns) {
    if (userMessage.toLowerCase().includes(pattern.toLowerCase())) {
      return false;
    }
  }
  return true;
}

// Helper function to fetch the most recent past AI messages for a specific user.
// Adjust this implementation to work with your actual data source (e.g., Airtable, database, etc.).
async function fetchPastAiMessages(userId, limit = 10) {
  try {
    // Example using a pseudo Airtable integration:
    // const records = await airtableBase('AIInteractions')
    //   .select({
    //     filterByFormula: `{userId} = '${userId}'`,
    //     maxRecords: limit,
    //     sort: [{ field: 'timestamp', direction: 'desc' }]
    //   })
    //   .firstPage();
    // return records.map(record => record.get('content')).join("\n");
    
    // Temporary placeholder implementation (replace with your actual logic):
    return "過去のAIの返答1\n過去のAIの返答2\n過去のAIの返答3\n過去のAIの返答4\n過去のAIの返答5";
  } catch (error) {
    console.error("Error fetching past AI messages:", error);
    return "";
  }
}

async function runCriticPass(aiDraft, userMessage, userId) {
  console.log('🔍 Starting critic pass with o3-mini-2025-01-31');
  
  // Extract service recommendations if present
  let serviceRecommendationSection = '';
  const recommendationMatch = aiDraft.match(/以下のサービスがあなたの状況に役立つかもしれません：[\s\S]*$/);
  if (recommendationMatch) {
    serviceRecommendationSection = recommendationMatch[0];
    console.log('Found service recommendations in AI response, preserving them');
    // Remove recommendations from the draft for critic review
    aiDraft = aiDraft.replace(recommendationMatch[0], '').trim();
  }
  
  // Fetch 10 past AI return messages for this user.
  const pastAiReturns = await fetchPastAiMessages(userId, 10);

  // Build the critic prompt including the user's question.
  const baseCriticPrompt = `
Adamがユーザーに送る文章をあなたが分析し、現実的であるか、またユーザーの特性やニーズに合っているかを評価してください。以下の手順に従ってください：
	1. 実現可能性の確認:
　　　内容が実行可能で現実的であるかを確認し、必要に応じて現実的な表現に修正してください。
	2. 出力の要件:
　　　• 修正後の内容のみを出力してください。修正点や理由は記述しないでください。
　　　• ラベルや修正を示唆する表現は含まないでください。
　　　• 元の文章の口調や共感的なトーンを維持してください。
	3. 整合性・一貫性の確認:
　　　最新のメッセージ内容、過去の会話履歴および過去のAIの返答との間に矛盾がないか確認してください。
  4. 段落わけと改行の確認:
  　　文章を段落わけし、改行を入れて読みやすくしてください。

[分析の基本フレームワーク]
1. 論理性チェック（MECE原則）:
   • 議論や説明に論理的な飛躍がないか
   • 重要な要素が漏れなく含まれているか
   • 各要素が相互に排他的か

2. 実現可能性の評価（5W1H分析）:
   • Who: 実行主体は明確か
   • What: 具体的な行動が示されているか
   • When: タイミングや期間は現実的か
   • Where: 場所や環境の考慮は適切か
   • Why: 目的や理由が明確か
   • How: 実行方法は具体的か

3. 内容の適切性チェック:
   • ユーザーの認知特性への配慮
   • 説明の難易度調整
   • 共感的なトーンの維持（但し必要に応じて反対の視点も検討する。）
   • 文化的配慮

4. 構造化と可読性:
   • 情報の階層構造
   • 段落分けの適切性
   • 視覚的な読みやすさ

5.安全性フィルター
   • 医療・健康・法律・財務に関するアドバイスは専門家への相談を促しているか。
   • 精神的健康に関するアドバイスは適切な配慮がなされているか。
   • 自傷行為や暴力を助長する（可能性含む）表現が内容に含まれていないか。また該当ケースがあればユーザーに対して当局への通報や相談窓口へ連絡するように促しているか。
   • 個人情報の取り扱いに関する注意喚起はあるか。
   • 違法行為や倫理的に問題のある行動を推奨していないか。また該当ケースがあればユーザーに対して必ず当局への出頭や相談窓口へ連絡するように促しているか。（違法行為の場合は必ず出頭を促す。）


--- チェック対象 ---
最新のドラフト:
${aiDraft}

ユーザーの質問:
${userMessage}

過去のAIの返答:
${pastAiReturns}
`;

  const messages = [{ role: 'user', content: baseCriticPrompt }];
  const criticOptions = {
    model: 'o3-mini-2025-01-31',
    messages,
    temperature: 1,
  };

  try {
    console.log('💭 Critic model:', criticOptions.model);
    const criticResponse = await openai.chat.completions.create(criticOptions);
    console.log('✅ Critic pass completed');
    let criticOutput = criticResponse.choices?.[0]?.message?.content || '';
    
    // Reattach service recommendations if they were present
    if (serviceRecommendationSection) {
      console.log('Reattaching service recommendations to critic output');
      criticOutput = criticOutput.trim() + '\n\n' + serviceRecommendationSection;
    }
    
    return criticOutput;
  } catch (err) {
    console.error('❌ Critic pass error:', err);
    // If critic fails, return original with recommendations
    if (serviceRecommendationSection) {
      return aiDraft.trim() + '\n\n' + serviceRecommendationSection;
    }
    return aiDraft;
  }
}

function validateMessageLength(message) {
  const MAX_LENGTH = 4000;
  if (message.length > MAX_LENGTH) {
    return message.slice(0, MAX_LENGTH) + '...';
  }
  return message;
}

const SHARE_URL = 'https://twitter.com/intent/tweet?' + 
  new URLSearchParams({
    text: 'AIカウンセラー「Adam」が発達障害の特性理解やキャリア相談をサポート。無料でLINEから利用できます！🤖\n\n#ADHD #ASD #発達障害 #神経多様性',
    url: 'https://line.me/R/ti/p/@767cfbjv'
  }).toString();

const POSITIVE_KEYWORDS = [
  '素晴らしい', '助かった', 'ありがとう', '感謝', 'すごい', 
  '役立った', '嬉しい', '助けになった', '期待', '良かった', '参考にします','いいね','便利','おすすめしたい','シェア','共有'
];

const PERSONAL_REFERENCES = ['adam', 'あなた', 'きみ', '君', 'Adam'];

function checkHighEngagement(userMessage, history) {
  // デバッグログを追加
  console.log('Checking engagement:', {
    message: userMessage,
    hasPersonalRef: PERSONAL_REFERENCES.some(ref => userMessage.toLowerCase().includes(ref)),
    hasPositive: POSITIVE_KEYWORDS.some(keyword => userMessage.includes(keyword))
  });

  // 人称への言及をチェック（必須）
  const hasPersonalReference = PERSONAL_REFERENCES.some(ref => 
    userMessage.toLowerCase().includes(ref)
  );

  // ポジティブキーワードを含む（必須）
  const hasPositiveKeyword = POSITIVE_KEYWORDS.some(keyword => 
    userMessage.includes(keyword)
  );
  
  // 単なる「ありがとう」系の短文は除外
  const simpleThankYous = ['ありがとう', 'ありがとうございます', 'thanks', 'thank you'];
  if (simpleThankYous.includes(userMessage.toLowerCase().trim())) {
    return false;
  }

  // 両方の条件を満たす場合のみtrueを返す
  return hasPersonalReference && hasPositiveKeyword;
}
  
async function processWithAI(systemPrompt, userMessage, history, mode, userId, client) {
  try {
    console.log(`Processing message in mode: ${mode}`);
    
    // Start performance measurement
    const startTime = Date.now();
    
    // Get user preferences
    const userPrefs = userPreferences.getUserPreferences(userId);
    
    // Check if this is a new user or has very few messages
    const isNewUser = history.length < 3;
    
    // Determine which model to use
    const useGpt4 = mode === 'characteristics' || mode === 'analysis';
    const model = useGpt4 ? 'gpt-4o' : 'gpt-4o';
    console.log(`Using model: ${model}`);
    
    // Run user needs analysis, conversation context extraction, and service matching in parallel
    const [userNeedsPromise, conversationContextPromise] = await Promise.all([
      // Analyze user needs from conversation history
      (async () => {
        console.log('Analyzing user needs from conversation history...');
        const needsStartTime = Date.now();
        const userNeeds = await userNeedsAnalyzer.analyzeUserNeeds(userMessage, history);
        console.log(`User needs analysis completed in ${Date.now() - needsStartTime}ms`);
        return userNeeds;
      })(),
      
      // Extract conversation context
      (async () => {
        console.log('Extracting conversation context...');
        const contextStartTime = Date.now();
        const conversationContext = extractConversationContext(history, userMessage);
        console.log(`Context extraction completed in ${Date.now() - contextStartTime}ms`);
        return conversationContext;
      })()
    ]);
    
    // Wait for both promises to resolve
    const userNeeds = await userNeedsPromise;
    const conversationContext = await conversationContextPromise;
    
    console.log('User needs analysis result:', JSON.stringify(userNeeds));
    
    // Start service matching process
    console.log('Starting service matching process with confidence threshold...');
    
    // Get service recommendations only if user preferences allow it
    let serviceRecommendationsPromise = Promise.resolve([]);
    if (userPrefs.showServiceRecommendations) {
      serviceRecommendationsPromise = serviceRecommender.getFilteredRecommendations(
        userId, 
        userNeeds,
        conversationContext
      );
    }
    
    // Prepare the messages for the AI model
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];
    
    // Run AI response generation and service matching in parallel
    const [aiResponse, serviceRecommendations] = await Promise.all([
      // Generate AI response
      (async () => {
        const aiStartTime = Date.now();
        const response = await tryPrimaryThenBackup({ 
          messages, 
          model,
          temperature: 0.7,
          max_tokens: 1000
        });
        console.log(`AI response generation completed in ${Date.now() - aiStartTime}ms`);
        return response;
      })(),
      
      // Wait for service recommendations
      serviceRecommendationsPromise
    ]);
    
    // Log the number of matching services
    if (userPrefs.showServiceRecommendations) {
      console.log(`Matching services before filtering: ${serviceRecommendations ? serviceRecommendations.length : 'undefined'} services met the confidence threshold`);
      console.log('Checking for cooldown period on previously recommended services...');
    }
    
    // Process the AI response
    let responseText = aiResponse;
    
    // Add service recommendations if user preferences allow it
    if (userPrefs.showServiceRecommendations && serviceRecommendations && serviceRecommendations.length > 0) {
      console.log(`Processing ${serviceRecommendations.length} service recommendations`);
      console.log(`Sample service structure: ${JSON.stringify(serviceRecommendations[0])}`);
      
      // Map service IDs to full service objects if needed
      let fullServiceRecommendations = serviceRecommendations;
      if (serviceRecommendations[0] && (typeof serviceRecommendations[0] === 'string' || !serviceRecommendations[0].description)) {
        const servicesModule = require('./services');
        fullServiceRecommendations = serviceRecommendations.map(service => {
          const serviceId = typeof service === 'string' ? service : service.id;
          return servicesModule.services.find(s => s.id === serviceId) || service;
        });
      }
      
      // Get user preferences
      const preferences = userPreferences.getUserPreferences(userId);
      const maxRecommendations = preferences.maxRecommendations || 3;
      const confidenceThreshold = preferences.minConfidenceScore || 0.6;
      
      // Create a simple presentation context instead of using the deleted function
      const presentationContext = {
        shouldBeMinimal: false,
        hasSeenServicesBefore: false,
        categoryFeedback: {},
        preferredCategory: null
      };
      
      // Check if user has seen services before (simplified)
      if (history && history.length > 0) {
        for (let i = 0; i < history.length; i++) {
          const msg = history[i];
          if (msg.role === 'assistant' && msg.content && 
              (msg.content.includes('サービス') || 
               msg.content.includes('お役立ち情報'))) {
            presentationContext.hasSeenServicesBefore = true;
            break;
          }
        }
      }
      
      // Detect basic distress indicators for minimal presentation
      const distressIndicators = [
        'つらい', '苦しい', '死にたい', '自殺', '助けて', 
        'しんどい', '無理', 'やばい', '辛い', '悲しい'
      ];
      
      if (userMessage) {
        for (const indicator of distressIndicators) {
          if (userMessage.includes(indicator)) {
            presentationContext.shouldBeMinimal = true;
            break;
          }
        }
      }
      
      // Filter recommendations based on user preferences and context
      let filteredRecommendations = fullServiceRecommendations
        .filter(service => {
          const confidence = service.confidence || service.confidenceScore || 0.8;
          return confidence >= confidenceThreshold;
        })
        .slice(0, maxRecommendations);
      
      // Filter out categories that received negative feedback
      if (presentationContext.categoryFeedback && Object.keys(presentationContext.categoryFeedback).length > 0) {
        filteredRecommendations = filteredRecommendations.filter(service => {
          // Determine service category based on criteria or tags
          let serviceCategory = null;
          if (service.criteria && service.criteria.topics) {
            if (service.criteria.topics.includes('employment')) serviceCategory = 'career';
            else if (service.criteria.topics.includes('mental_health')) serviceCategory = 'mental_health';
            else if (service.criteria.topics.includes('social')) serviceCategory = 'social';
            else if (service.criteria.topics.includes('daily_living')) serviceCategory = 'financial';
          }
          
          // Also check tags if category not determined
          if (!serviceCategory && service.tags) {
            if (service.tags.includes('employment') || service.tags.includes('career')) serviceCategory = 'career';
            else if (service.tags.includes('mental_health')) serviceCategory = 'mental_health';
            else if (service.tags.includes('social') || service.tags.includes('community')) serviceCategory = 'social';
            else if (service.tags.includes('financial') || service.tags.includes('assistance')) serviceCategory = 'financial';
          }
          
          // If this category received negative feedback, filter it out
          if (serviceCategory && presentationContext.categoryFeedback[serviceCategory] === 'negative') {
            console.log(`Filtering out service ${service.id} due to negative feedback for category ${serviceCategory}`);
            return false;
          }
          
          return true;
        });
      }
      
      // If we still have recommendations after filtering
      if (filteredRecommendations.length > 0) {
        // Determine the appropriate introduction text based on user needs and preferred category
        let introText = '\n\n【お役立ち情報】\n以下のサービスがお役に立つかもしれません：\n';
        
        // Group services by category for better organization
        const servicesByCategory = {
          'career': [],
          'mental_health': [],
          'social': [],
          'financial': [],
          'other': []
        };
        
        // Categorize services
        for (const service of filteredRecommendations) {
          let serviceCategory = null;
          
          // Determine service category
          if (service.criteria && service.criteria.topics) {
            if (service.criteria.topics.includes('employment')) serviceCategory = 'career';
            else if (service.criteria.topics.includes('mental_health')) serviceCategory = 'mental_health';
            else if (service.criteria.topics.includes('social')) serviceCategory = 'social';
            else if (service.criteria.topics.includes('daily_living')) serviceCategory = 'financial';
          }
          
          if (!serviceCategory && service.tags) {
            if (service.tags.includes('employment') || service.tags.includes('career')) serviceCategory = 'career';
            else if (service.tags.includes('mental_health')) serviceCategory = 'mental_health';
            else if (service.tags.includes('social') || service.tags.includes('community')) serviceCategory = 'social';
            else if (service.tags.includes('financial') || service.tags.includes('assistance')) serviceCategory = 'financial';
          }
          
          if (!serviceCategory) serviceCategory = 'other';
          
          // Skip services from negatively rated categories
          if (presentationContext.categoryFeedback[serviceCategory] === 'negative') {
            console.log(`Filtering out service ${service.id} due to negative feedback for category ${serviceCategory}`);
            continue;
          }
          
          servicesByCategory[serviceCategory].push(service);
        }
        
        // Prioritize services based on preferred category or user needs
        let priorityCategory = presentationContext.preferredCategory;
        
        if (!priorityCategory && userNeeds) {
          if (userNeeds.mental_health && 
              (userNeeds.mental_health.shows_depression || userNeeds.mental_health.shows_anxiety)) {
            priorityCategory = 'mental_health';
          } else if (userNeeds.employment && 
                    (userNeeds.employment.seeking_job || userNeeds.employment.career_transition) &&
                    presentationContext.categoryFeedback['career'] !== 'negative') {
            priorityCategory = 'career';
          } else if (userNeeds.social && 
                    (userNeeds.social.isolation || userNeeds.social.is_hikikomori)) {
            priorityCategory = 'social';
          } else if (userNeeds.daily_living && userNeeds.daily_living.financial_assistance) {
            priorityCategory = 'financial';
          }
        }
        
        // Set the appropriate introduction based on priority category
        if (priorityCategory === 'mental_health') {
          introText = '\n\n【メンタルヘルスサポート】\nこちらのサービスが心の健康をサポートするかもしれません：\n';
        } else if (priorityCategory === 'career' && presentationContext.categoryFeedback['career'] !== 'negative') {
          introText = '\n\n【キャリア支援サービス】\nお仕事の状況は大変かと思います。少しでもお役に立てるかもしれないサービスをご紹介します：\n';
        } else if (priorityCategory === 'social') {
          introText = '\n\n【コミュニティサポート】\n以下のサービスが社会とのつながりをサポートします：\n';
        } else if (priorityCategory === 'financial') {
          introText = '\n\n【生活支援サービス】\n経済的な支援に関する以下のサービスが参考になるかもしれません：\n';
        }
        
        // Build our final recommendations list prioritizing the preferred category
        let finalRecommendations = [];
        
        if (priorityCategory && servicesByCategory[priorityCategory].length > 0) {
          // Add services from the priority category first
          finalRecommendations = [...servicesByCategory[priorityCategory]];
          
          // If we need more services, add from other categories (excluding negative feedback categories)
          if (finalRecommendations.length < 3) {
            for (const [category, services] of Object.entries(servicesByCategory)) {
              if (category !== priorityCategory && category !== 'other' && 
                  presentationContext.categoryFeedback[category] !== 'negative') {
                finalRecommendations = [...finalRecommendations, ...services];
                if (finalRecommendations.length >= 3) break;
              }
            }
            
            // If still not enough, add from 'other' category
            if (finalRecommendations.length < 3 && servicesByCategory['other'].length > 0) {
              finalRecommendations = [...finalRecommendations, ...servicesByCategory['other']];
            }
          }
        } else {
          // If no priority category, combine all non-negative categories
          for (const [category, services] of Object.entries(servicesByCategory)) {
            if (presentationContext.categoryFeedback[category] !== 'negative') {
              finalRecommendations = [...finalRecommendations, ...services];
            }
          }
        }
        
        // Limit to max 3 recommendations
        finalRecommendations = finalRecommendations.slice(0, 3);
        
        // Only proceed if we have recommendations to show after all filtering
        if (finalRecommendations.length > 0) {
          // Add service recommendations to the response with improved formatting
          responseText += introText;
          
          // Check if this is a new user (fewer than 3 interactions)
          const isNewUser = history.length < 3;
          
          // Add a subtle hint for new users about how to control service display
          if (isNewUser && !presentationContext.hasSeenServicesBefore) {
            responseText += '（「サービス表示オフ」と言っていただくと、サービス情報を非表示にできます）\n\n';
          }
          
          // Display the services with improved formatting
          finalRecommendations.forEach((service, index) => {
            // Customize service presentation based on context
            if (presentationContext.shouldBeMinimal) {
              // Minimal presentation for users who seem overwhelmed
              responseText += `${index + 1}. **${service.name}**\n   ${service.url}\n\n`;
            } else {
              // Standard presentation
              responseText += `${index + 1}. **${service.name}**\n`;
              if (service.description) {
                responseText += `   ${service.description}\n`;
              }
              if (service.url) {
                responseText += `   ${service.url}\n`;
              }
              responseText += '\n';
            }
          });
          
          // Record service recommendations
          try {
            for (const service of finalRecommendations) {
              await recordServiceRecommendation(userId, service.id, 0.8); // Use default confidence score
            }
          } catch (error) {
            console.error('Error recording service recommendations:', error);
          }
        }
      }
    }
    
    console.log(`Total processing time: ${Date.now() - startTime}ms`);
    return responseText;
  } catch (error) {
    console.error('Error in processWithAI:', error);
    return '申し訳ありません。処理中にエラーが発生しました。もう一度お試しください。';
  }
}

// Add timeout handling with retries and proper error handling
const MAX_RETRIES = 3;
const TIMEOUT_PER_ATTEMPT = 25000; // 25 seconds per attempt

async function processMessage(userId, messageText) {
  if (messageText.includes('思い出して') || messageText.includes('記憶')) {
    return handleChatRecallWithRetries(userId, messageText);
  }
  // ... existing message handling code ...
}

async function handleChatRecallWithRetries(userId, messageText) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`🔄 Chat recall attempt ${attempt}/${MAX_RETRIES} for user ${userId}`);
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout on attempt ${attempt}`)), TIMEOUT_PER_ATTEMPT);
      });

      // Race between the chat recall and timeout
      const result = await Promise.race([
        fetchAndAnalyzeHistory(userId),
        timeoutPromise
      ]);
      
      console.log(`✅ Chat recall succeeded on attempt ${attempt}`);
      return result;
      
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Attempt ${attempt} failed: ${error.message}`);
      
      // If we have more attempts, wait before retrying
      if (attempt < MAX_RETRIES) {
        console.log(`Waiting 1 second before attempt ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // If all attempts failed, return a user-friendly message
  console.log(`❌ All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`);
  return {
    type: 'text',
    text: `申し訳ございません。${MAX_RETRIES}回試みましたが、処理を完了できませんでした。\n少し時間をおいてから、もう一度お試しください。`
  };
}

async function fetchAndAnalyzeHistory(userId) {
  const startTime = Date.now();
  console.log(`📚 Fetching chat history for user ${userId}`);
  
  try {
    const history = await fetchUserHistory(userId, 200);
    console.log(`📝 Found ${history.length} records in ${Date.now() - startTime}ms`);
    
    // Process the history and generate response
    const response = await generateHistoryResponse(history);
    
    console.log(`✨ History analysis completed in ${Date.now() - startTime}ms`);
    return {
      type: 'text',
      text: response
    };
    
  } catch (error) {
    console.error(`❌ Error in fetchAndAnalyzeHistory: ${error.message}`);
    throw error;
  }
}

async function handleEvent(event) {
  if (event.type === 'follow') {
    console.log('Handling follow event for user:', event.source.userId);
    return handleFollowEvent(event);
  }

  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;

  try {
    // Handle image messages
    if (event.message.type === 'image') {
      console.log('Processing image message...');
      return handleImage(event);
    }

    // Handle text messages with existing logic
    if (event.message.type === 'text') {
      const userText = event.message.text.trim();
      // If the user clearly asks about vision capabilities using both technical and simpler words, answer accordingly.
      if (
        (
          userText.toLowerCase().includes("vision") ||
          userText.includes("画像認識") ||
          userText.includes("画像生成") ||
          userText.includes("画像について") ||
          userText.includes("写真について") ||
          userText.includes("画像") ||
          userText.includes("写真")
        ) &&
        (userText.endsWith("？") || userText.endsWith("?"))
      ) {
        await handleVisionExplanation(event);
        return; // Stop further processing for this event.
      }
      return handleText(event);
    }

    console.log(`Unsupported message type: ${event.message.type}`);
    return Promise.resolve(null);

  } catch (error) {
    console.error('Error in handleEvent:', error);
    return Promise.resolve(null);
  }
}

async function handleText(event) {
  try {
    const userId = event.source.userId;
    const messageText = event.message.text;
    
    // Check for general help request
    if (userMessage.toLowerCase() === 'ヘルプ' || 
        userMessage.toLowerCase() === 'help' || 
        userMessage.toLowerCase() === 'へるぷ') {
      // Return the general help message
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: helpSystem.getGeneralHelp()
      });
      return;
    }
    
    // Handle confusion request
    if (isConfusionRequest(messageText)) {
      await handleVisionExplanation(event);
      return;
    }
    
    const userMessage = event.message.text.trim();

    // Check for user preference commands
    const updatedPreferences = userPreferences.processPreferenceCommand(userId, userMessage);
    if (updatedPreferences) {
      let responseMessage = '';
      
      // Handle help request
      if (updatedPreferences.helpRequested) {
        responseMessage = userPreferences.getHelpMessage();
      } 
      // Handle settings check request
      else if (updatedPreferences.settingsRequested) {
        responseMessage = userPreferences.getCurrentSettingsMessage(userId);
      }
      // Handle preference updates
      else {
        // Create a more conversational response based on what was changed
        if (updatedPreferences.showServiceRecommendations !== undefined) {
          if (updatedPreferences.showServiceRecommendations) {
            responseMessage = `サービス表示をオンにしました。お役立ちそうなサービスがあれば、会話の中でご紹介します。`;
          } else {
            // Check if this was triggered by negative feedback
            const lowerMessage = userMessage.toLowerCase();
            const negativePatterns = ['要らない', 'いらない', '不要', '邪魔', '見たくない', '表示しないで', '非表示', '消して'];
            const isNegativeFeedback = negativePatterns.some(pattern => lowerMessage.includes(pattern));
            
            if (isNegativeFeedback) {
              // Minimal response for negative feedback
              responseMessage = `わかりました。`;
            } else {
              responseMessage = `サービス表示をオフにしました。`;
            }
          }
        } else if (updatedPreferences.maxRecommendations !== undefined) {
          if (updatedPreferences.maxRecommendations === 0) {
            responseMessage = `サービスを表示しない設定にしました。`;
          } else {
            responseMessage = `表示するサービスの数を${updatedPreferences.maxRecommendations}件に設定しました。`;
          }
        } else if (updatedPreferences.minConfidenceScore !== undefined) {
          responseMessage = `信頼度${Math.round(updatedPreferences.minConfidenceScore * 100)}%以上のサービスのみ表示するように設定しました。`;
        } else {
          // Fallback to current settings if we can't determine what changed
          responseMessage = userPreferences.getCurrentSettingsMessage(userId);
        }
      }
      
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: responseMessage
      });
      
      // Store the interaction
      await storeInteraction(userId, 'user', userMessage);
      await storeInteraction(userId, 'assistant', responseMessage);
      
      return;
    }
    
    // 特定の問い合わせ（ASD支援の質問例や使い方の案内）を検出
    if (userMessage.includes("ASD症支援であなたが対応できる具体的な質問例") && userMessage.includes("使い方")) {
      return handleASDUsageInquiry(event);
    }
    
    // pendingImageExplanations のチェック（はい/いいえ 判定）
    if (pendingImageExplanations.has(userId)) {
      if (userMessage === "はい") {
        const explanationText = pendingImageExplanations.get(userId);
        pendingImageExplanations.delete(userId);
        console.log("ユーザーの「はい」が検出されました。画像生成を開始します。");
        return handleImageExplanation(event, explanationText);
      } else if (userMessage === "いいえ") {
        pendingImageExplanations.delete(userId);
        console.log("ユーザーの「いいえ」が検出されました。画像生成をキャンセルします。");
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: "承知しました。引き続きテキストでの回答を行います。"
        });
      }
    }

    // セキュリティチェック
    const isSafe = await securityFilterPrompt(userMessage);
    if (!isSafe) {
      const refusal = '申し訳ありません。このリクエストには対応できません。';
      await storeInteraction(userId, 'assistant', refusal);
      await client.replyMessage(event.replyToken, { type: 'text', text: refusal });
      return null;
    }

    // 最近の会話履歴の取得
    const history = await fetchUserHistory(userId, 10);
    const lastAssistantMessage = history.filter(item => item.role === 'assistant').pop();

    // 画像説明の提案トリガーチェック：isConfusionRequest のみを使用
    let triggerImageExplanation = false;
    if (isConfusionRequest(userMessage)) {
      triggerImageExplanation = true;
    }

    // トリガーされた場合、pending 状態として前回の回答を保存し、yes/no で質問
    if (triggerImageExplanation) {
      if (lastAssistantMessage) {
        pendingImageExplanations.set(userId, lastAssistantMessage.content);
      } else {
        pendingImageExplanations.set(userId, "説明がありません。");
      }
      const suggestionMessage = "前回の回答について、画像による説明を生成しましょうか？「はい」または「いいえ」でお答えください。";
      console.log("画像による説明の提案をユーザーに送信:", suggestionMessage);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: suggestionMessage
      });
    }

    // 通常のテキスト処理へ進む
    await storeInteraction(userId, 'user', userMessage);

    const { mode, limit } = determineModeAndLimit(userMessage);
    console.log(`mode=${mode}, limit=${limit}`);

    const historyForAI = await fetchUserHistory(userId, limit);
    const systemPrompt = getSystemPromptForMode(mode);

    const aiReply = await processWithAI(
      systemPrompt,
      userMessage,
      historyForAI,
      mode,
      userId,
      client
    );

    await storeInteraction(userId, 'assistant', aiReply);

    const lineMessage = { type: 'text', text: aiReply.slice(0, 2000) };
    console.log('LINEユーザーへの返信:', lineMessage.text);

    try {
      await client.replyMessage(event.replyToken, lineMessage);
      console.log('ユーザーへの返信に成功しました。');
    } catch (err) {
      console.error('ユーザーへの返信時のエラー:', err);
    }
    return null;
  } catch (error) {
    console.error('Error handling text message:', error);
    return Promise.resolve(null);
  }
}

// Add image handler function (modified to store the image description in Airtable)
async function handleImage(event) {
  try {
    // Retrieve the image sent by the user
    const stream = await client.getMessageContent(event.message.id);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    // Moderate the image using OpenAI's moderation endpoint
    const moderationResp = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: [
        {
          type: "image_url",
          image_url: { url: dataUrl }
        }
      ],
    });

    const moderationResult = moderationResp.results && moderationResp.results[0];
    if (moderationResult && moderationResult.flagged) {
      // Build a list of violation categories that are flagged
      let violations = [];
      for (let category in moderationResult.categories) {
        if (moderationResult.categories[category] === true) {
          violations.push(category);
        }
      }
      // Map violation categories to Japanese terms
      const categoryTranslations = {
        "sexual": "性的",
        "sexual/minors": "未成年者に関する性的",
        "harassment": "嫌がらせ",
        "harassment/threatening": "脅迫的な嫌がらせ",
        "hate": "憎悪",
        "hate/threatening": "脅迫的な憎悪",
        "illicit": "不正行為",
        "illicit/violent": "暴力的な不正行為",
        "self-harm": "自傷行為",
        "self-harm/intent": "自傷行為の意図",
        "self-harm/instructions": "自傷行為の助言",
        "violence": "暴力",
        "violence/graphic": "グラフィックな暴力"
      };
      // Use the translation mapping to create the violation text in Japanese
      const violationText = `申し訳ありません。この画像はコンテンツポリシーに違反している可能性があります。違反カテゴリ：${violations.map(category => categoryTranslations[category] || category).join('、')}。`;
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: violationText
      });
      return;
    }

    // If no violation is found, continue to generate a description for the image.
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "この画像の内容を日本語で詳しく説明してください。" },
            { 
              type: "image_url", 
              image_url: {
                url: dataUrl,
                detail: "auto"
              }
            }
          ]
        }
      ],
      max_tokens: 300
    });

    const imageDescription = response.choices[0].message.content;
    const userId = event.source.userId;
    await storeInteraction(userId, 'assistant', `Image explanation provided: ${imageDescription}`);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: imageDescription
    });

  } catch (error) {
    console.error('Error in handleImage:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '画像の解析に失敗しました。しばらくしてから再度お試しください。'
    });
  }
}

app.get('/', (req, res) => {
  res.send('Adam App Cloud v2.3 is running. Ready for LINE requests.');
});

app.post('/webhook', line.middleware(config), (req, res) => {
  console.log('Webhook was called! Events:', req.body.events);
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Webhook error:', err);
      res.status(200).json({});
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

const RATE_LIMIT_CLEANUP_INTERVAL = 1000 * 60 * 60;

setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of rateLimit.entries()) {
    if (now - timestamp > RATE_LIMIT_CLEANUP_INTERVAL) {
      rateLimit.delete(userId);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL);

app.use((err, req, res, next) => {
  if (err.timeout) {
    console.error('Request timeout:', err);
    res.status(200).json({});
  }
  next();
});

function isConfusionRequest(message) {
  const lowered = message.toLowerCase();
  
  // Only consider messages that are at most 10 characters long.
  if (lowered.length > 10) return false;
  
  return (
    lowered.includes("わから") ||
    lowered.includes("分から") ||
    lowered.includes("わかりません") ||
    lowered.includes("分かりません") ||
    lowered.includes("よくわから") ||
    lowered.includes("よく分から") ||
    lowered.includes("わかん") ||
    lowered.includes("分かん") ||
    lowered.includes("理解できない") ||
    lowered.includes("不明") ||
    lowered.includes("不明瞭") ||
    lowered.includes("不明確") ||
    lowered.includes("意味不明") ||
    lowered.includes("わかんない")
  );
}

async function handleImageExplanation(event, explanationText) {
  try {
    const promptForImage = "Illustrate the following explanation visually in a simple diagram: " + explanationText;
    console.log("Generating image explanation with prompt:", promptForImage);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: promptForImage,
      n: 1,
      size: "1024x1024",
    });

    const imageUrl = response.data[0].url;
    console.log("Generated image URL:", imageUrl);

    // Store the image explanation in Airtable.
    await storeInteraction(event.source.userId, 'assistant', `Image explanation provided: ${imageUrl}`);

    // Send two messages: one text message and one image message.
    await client.replyMessage(event.replyToken, [
      {
        type: 'text',
        text: "こちらは画像による説明です。\n" + explanationText
      },
      {
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
      }
    ]);
  } catch (error) {
    console.error("Error generating image explanation:", error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: "【システム通知】申し訳ありません。画像での説明生成に失敗しました。もう一度お試しください。"
    });
  }
}

async function handleASDUsageInquiry(event) {
  const explanation = `こんにちは。
私は、発達障害（ASDやADHDなど）を持つ方々をサポートするアシスタントのAdamです。貴方の悩み相談の他、（30回以上の会話で）自己理解や適職のアドバイスも行います。

【対応可能なトピックについて】
私は、幅広いお話（貴方の趣味や興味のあること含む）に対応できますが、主に以下のような悩みや相談が比較的得意です。
	1.	「集中力が続かず、日常生活や仕事に支障を感じています。どうすればいいですか？」
	2.	「仕事中にイライラしてストレスを感じています。どうすればいいですか？」
	3.	「人とのコミュニケーションに関して悩みを抱えています。」
	4.	「日常生活でのストレスの感じ方や対処法について知りたいと思っています。」

【利用方法について】
	1.	まず、あなたは相談内容や質問をテキストで送信してください。
	2.	必要に応じて、あなたは画像も送信することができます。
　　例えば、あなたが状況をより詳しく伝えたい場合、問題を示す写真やスクリーンショットなどの画像を送信してください。
	3.	もし、私が前回回答した内容があなたにとって分かりにくかった場合、あなたは「分かりません」または「理解できません」と送信してください。
　　その場合、私は「前回の回答について、画像による説明を生成しましょうか？「はい」または「いいえ」でお答えください。」と尋ねるメッセージを送信します。
　　あなたは、そのメッセージに対して「はい」または「いいえ」で回答してください。
　　- あなたが「はい」と回答した場合、私は画像を作成して、詳しい説明を送信します。
　　- あなたが「いいえ」と回答した場合、私は別の方法で説明を行います。
　　-🚨⚠️「適職診断」や「自己理解診断」は、30回以上の会話データをもとに行いますので、実行前に30回以上の会話をしてください。🚨⚠️

【サービス推薦システムについて】
会話の中で、あなたのニーズに合わせたサポートサービスを紹介することがあります。この機能は以下のようにカスタマイズできます：
	•	サービス表示オフ：サービス推薦を表示しないようにする
	•	サービス表示オン：サービス推薦を表示する
	•	サービス数[数字]：表示するサービスの数を設定する（例：サービス数2）
	•	信頼度[数字]：サービスの関連性の最低基準を設定する（例：信頼度80）
	•	サービス設定確認：現在の設定を確認する

また、「お仕事関係ない」や「メンタルについて知りたい」などの自然な表現でも、表示するサービスの種類を調整できます。

【画像送信について】
	•	あなたが送信する場合：
　あなたは、自分の問題や状況をより明確に伝えるために、写真やスクリーンショットなどの画像を送信することができます。
	•	私が送信する場合：
　あなたが私の回答を理解しにくいと感じた場合、前述の手順に従って「はい」と回答すると、私は画像を使った詳しい説明を送信します。

【会話の進め方について】
	1.	あなたと日常の話題、あなたが感じていること、生活状況、そしてちょっとした悩みを共有してください。
	2.	あなたは、まず簡単な会話から自分の背景や考えを私に伝えてください。
	3.	私は、その情報をもとに、後でより具体的で分かりやすいアドバイスをします。
	4.	あなたは、ASDの特徴として、自分と他者の違いや情報の受け取り方が分かりにくいと感じる事があるかもしれません。
　　もし、あなたがその点で混乱した場合、私はゆっくり丁寧に話を進めるようにします。

私は、以上の方法であなたに分かりやすいサポートをします。
どんな相談でも遠慮なく私にお話しください。

どうぞよろしくお願いいたします。`;
  
  // Store the explanation message in Airtable.
  await storeInteraction(event.source.userId, 'assistant', explanation.trim());
  
  // Send the reply to the user.
  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: explanation
  });
}

// Add this function to check the image for policy violations
async function securityFilterImage(imageBuffer) {
  // This is a dummy implementation.
  // In a real-world scenario, you could call an image moderation API here.
  // For example, if the file size is suspiciously small, we simulate a violation.
  if (imageBuffer.length < 100) {
    return { isSafe: false, reason: "画像サイズが小さすぎます" };
  }
  // Otherwise, assume it's safe.
  return { isSafe: true, reason: "" };
}

/**
 * processChatMessage uses a reasoning model ("o3-mini") with a specified reasoning effort.
 * It returns an object containing the final visible answer and the hidden chain-of-thought token details.
 *
 * Reasoning Effort:
 * The parameter reasoning_effort ("medium" in this example) directs the model to generate additional reasoning tokens,
 * which are used for internal complex problem solving before creating the final answer.
 */
async function processChatMessage(prompt, userId) {
  const response = await openai.chat.completions.create({
    model: "o3-mini",
    reasoning_effort: "medium", // Instructs the model on how much extra internal reasoning to perform
    messages: [
      { role: "user", content: prompt }
    ],
    store: true,
    // Optionally set max_completion_tokens if needed.
  });

  const finalAnswer = response.choices[0].message.content;
  const reasoningTokenDetails = response.usage && response.usage.completion_tokens_details;
  return { finalAnswer, reasoningTokenDetails };
}

// Generate the final answer and then output the reasoning token details to the Terminal.
(async () => {
  const prompt = "Example prompt that requires multi-step reasoning.";
  const userId = "sampleUser123";

  // Process the user's prompt using the reasoning model
  const { finalAnswer, reasoningTokenDetails } = await processChatMessage(prompt, userId);
  
  // Display the final visible answer first
  console.log("Final assistant response:", finalAnswer);
  
  // Generate (log) the chain-of-thought details after the final answer.
  console.log(`Reasoning tokens details for user ${userId}:`, reasoningTokenDetails);
})();

/**
 * handleVisionExplanation sends an explanation regarding vision recognition and generation functions.
 *
 * The explanation outlines:
 * 1. Vision Recognition:
 *    - The assistant analyzes images (provided via URL or Base64) to deliver an overall summary and identify major objects.
 *    - It does not provide detailed spatial or fine-grained analysis.
 *
 * 2. Vision Generation:
 *    - When necessary, the assistant can generate images (e.g., using the dall-e-3 model) to supplement textual explanations.
 *
 * Note:
 * - This explanation is triggered only when the user asks a clear question about vision (using defined keywords and a question mark).
 * - The message is stored in Airtable once sent out to users.
 */
async function handleVisionExplanation(event) {
  const explanation = `
【Vision 機能のご案内】
1. 画像認識機能:
　・送信された画像（URLまたはBase64形式）から全体の概要や主要なオブジェクトを解析します。
　・詳細な位置情報や細かい解析は行いません。
2. 画像生成機能:
　・必要に応じて、テキスト説明を補強するために画像を生成します（例: dall-e-3 を使用）。
※画像に関する詳細な解析が難しい場合は、画像の内容をテキストでご説明いただくとより詳しい回答が可能です。
  `;

  // Store the explanation message in Airtable
  await storeInteraction(event.source.userId, 'assistant', explanation.trim());

  // Send the message reply to the user
  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: explanation.trim(),
  });
}

async function handleFollowEvent(event) {
  try {
    const userId = event.source.userId;
    const greetingMessage = {
      type: 'text',
      text: "こんにちは！私はあなたのバーチャルアシスタントのAdamです。\n\n" +
            "まずはお互いのことをよく知り合うことから始めましょう。\n\n" +
            "お名前（ニックネーム）を伺ってもよろしいでしょうか？\n" +
            "お好きな趣味は何ですか？\n\n" +
            "⚠️ 使い方についてはメニューキーボード左上の「使い方を確認」を押してください。"
    };

    // Store the greeting in conversation history
    await storeInteraction(userId, 'assistant', greetingMessage.text);

    // Actually send the message using the replyToken
    await client.replyMessage(event.replyToken, greetingMessage);
    console.log('Greeting message sent successfully to user:', userId);
    
    return null;
  } catch (error) {
    console.error('Error handling follow event:', error);
    return Promise.resolve(null);
  }
}

module.exports = { handleFollowEvent };

// Add this method to the appropriate location in server.js
// Helper function to check if user has primarily emotional needs
function _hasEmotionalNeeds(userNeeds) {
  // Check for relationship needs
  if (userNeeds.relationships) {
    if (userNeeds.relationships.seeking_romantic_connection ||
        userNeeds.relationships.seeking_emotional_support ||
        userNeeds.relationships.desire_for_intimacy ||
        userNeeds.relationships.loneliness) {
      return true;
    }
  }
  
  // Check for social isolation combined with mental health indicators
  if (userNeeds.social && userNeeds.social.isolation && 
      userNeeds.mental_health && (userNeeds.mental_health.shows_depression || 
                                 userNeeds.mental_health.shows_anxiety)) {
    return true;
  }
  
  return false;
}

// Extract conversation context from history and current message
function extractConversationContext(history, currentMessage) {
  try {
    // Initialize context object
    const context = {
      recentTopics: [],
      currentMood: null,
      urgency: 0
    };
    
    // Ensure history is an array
    const historyArray = Array.isArray(history) ? history : [];
    
    // Define keywords for topics
    const topicKeywords = {
      employment: ['仕事', '就職', '転職', '就労', '働く', '職場', 'キャリア', '雇用', '求人', '面接', '履歴書', '職業', '就活', 'アルバイト', 'パート', '収入', '給料', '失業', '無職'],
      education: ['学校', '勉強', '教育', '学習', '授業', '講座', '研修', '資格', '試験', '大学', '高校', '専門学校', '学位', '卒業', '入学', '留学', '奨学金'],
      mental_health: ['不安', '鬱', 'うつ', '発達障害', 'ASD', 'ADHD', '自閉症', 'アスペルガー', 'パニック', 'ストレス', '精神', '心理', 'カウンセリング', '療法', '診断', '症状', '特性', '過敏', '感覚'],
      social: ['友達', '人間関係', '社交', '交流', 'コミュニケーション', '孤独', '孤立', '引きこもり', 'ひきこもり', '外出', '会話', '対人', '付き合い', 'グループ', 'コミュニティ'],
      relationships: ['恋愛', '結婚', '離婚', '夫婦', '家族', '親子', '子育て', 'パートナー', '彼氏', '彼女', '夫', '妻', '恋人', '片思い', '告白', 'デート', '愛情'],
      daily_living: ['生活', '住居', '家賃', '食事', '健康', '医療', '保険', '福祉', '支援', '手当', '制度', '相談', '窓口', '申請', '手続き', '書類', '役所', '市役所', '区役所']
    };
    
    // Define keywords for moods
    const moodKeywords = {
      anxious: ['不安', '心配', '怖い', 'ドキドキ', '緊張', 'パニック', '恐怖'],
      depressed: ['鬱', 'うつ', '悲しい', '辛い', '苦しい', '絶望', '無気力', '疲れた', '生きる意味'],
      overwhelmed: ['疲れた', '限界', '無理', 'パンク', '混乱', '余裕がない', 'ストレス', '大変'],
      angry: ['怒り', '腹立たしい', 'イライラ', '許せない', '不満', '憤り', '不快'],
      hopeful: ['希望', '楽しみ', '期待', '前向き', 'ポジティブ', '明るい', '良くなる']
    };
    
    // Define keywords for urgency
    const urgencyKeywords = ['すぐに', '急いで', '今すぐ', '緊急', '危険', '助けて', '死にたい', '自殺', '今日中', '明日まで', '切迫', '待てない', '限界'];
    
    // Combine current message with last 5 messages from history
    const recentMessages = [
      ...historyArray.slice(-5).map(msg => msg.content),
      currentMessage
    ];
    
    // Extract topics from all recent messages
    for (const message of recentMessages) {
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        for (const keyword of keywords) {
          if (message.includes(keyword)) {
            if (!context.recentTopics.includes(topic)) {
              context.recentTopics.push(topic);
            }
            break; // Once we find a match for this topic, move to next topic
          }
        }
      }
    }
    
    // Detect current mood (from last 2 messages only for recency)
    const recentText = [
      currentMessage, 
      historyArray.slice(-1)[0]?.content || ''
    ].join(' ');
    
    for (const [mood, keywords] of Object.entries(moodKeywords)) {
      for (const keyword of keywords) {
        if (recentText.includes(keyword)) {
          context.currentMood = mood;
          break; // Once we find a mood, we stop looking
        }
      }
      if (context.currentMood) break; // If we found a mood, stop checking other moods
    }
    
    // Check for urgency (in current message only)
    for (const keyword of urgencyKeywords) {
      if (currentMessage.includes(keyword)) {
        context.urgency = 1;
        break;
      }
    }
    
    return context;
  } catch (error) {
    console.error('Error extracting conversation context:', error);
    return {
      recentTopics: [],
      currentMood: null,
      urgency: 0
    };
  }
}

// Check required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('ANTHROPIC_API_KEY environment variable is not set. Claude model will not be available.');
}

// Add this before the UserPreferences class

/**
 * Centralized Help System
 * All user guidance and help documentation is consolidated here
 */
const helpSystem = {
  // General help
  getGeneralHelp() {
    return `ADamとの使い方:
・一般的な会話: 質問や悩みを自由に話しかけてください
・ヘルプ: 「ヘルプ」と入力すると、このメッセージが表示されます
・サービス設定: 「サービス設定について」と入力すると、サービス推薦の設定方法を確認できます`;
  },
  
  // Service recommendation settings help
  getServiceSettingsHelp() {
    return `サービス表示の設定方法：
・「サービスを表示して」または「サービスを表示しないで」と言っていただくと、サービス表示のオン/オフを切り替えられます。
・「サービスを3つ表示して」のように数字を指定すると、表示するサービスの数を変更できます（0～5まで）。
・「信頼度80%以上のサービスを表示して」のように言っていただくと、表示する信頼度の閾値を変更できます（40%～90%まで）。
・「今の設定は？」と聞いていただくと、現在の設定を確認できます。`;
  }
};

class UserPreferences {
  constructor() {
    this.preferences = {};
    this.defaultPreferences = {
      showServiceRecommendations: true,
      maxRecommendations: 3,
      minConfidenceScore: 0.6,
      serviceInteractions: {} // Track interactions with services
    };
    this.preferencesPath = path.join(__dirname, 'user_preferences.json');
    this._loadPreferences();
  }

  // Load preferences from file
  _loadPreferences() {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const data = fs.readFileSync(this.preferencesPath, 'utf8');
        this.preferences = JSON.parse(data);
        console.log('Loaded user preferences from file');
      } else {
        console.log('No preferences file found, using default preferences');
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      console.log('Using default preferences due to error');
    }
  }

  // Save preferences to file
  _savePreferences() {
    try {
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences, null, 2), 'utf8');
      console.log('Saved user preferences to file');
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }

  // Get preferences for a user
  getUserPreferences(userId) {
    if (!this.preferences[userId]) {
      this.preferences[userId] = { ...this.defaultPreferences };
      this._savePreferences();
    }
    return this.preferences[userId];
  }

  // Update preferences for a user
  updateUserPreferences(userId, newPreferences) {
    if (!this.preferences[userId]) {
      this.preferences[userId] = { ...this.defaultPreferences };
    }
    
    this.preferences[userId] = {
      ...this.preferences[userId],
      ...newPreferences
    };
    
    this._savePreferences();
    return this.preferences[userId];
  }

  // Get help message explaining available preference commands
  getHelpMessage() {
    // Uses the centralized help system
    return helpSystem.getServiceSettingsHelp();
  }

  // Get current settings message for a user
  getCurrentSettingsMessage(userId) {
    const prefs = this.getUserPreferences(userId);
    return `現在の設定：サービス表示は${prefs.showServiceRecommendations ? 'オン' : 'オフ'}です。表示数は${prefs.maxRecommendations}件で、信頼度${Math.round(prefs.minConfidenceScore * 100)}%以上のサービスを表示します。`;
  }

  // Process preference commands from user messages
  processPreferenceCommand(userId, message) {
    // Convert to lowercase for case-insensitive matching
    const lowerMessage = message.toLowerCase();
    
    // Check for help or information about service settings
    if (lowerMessage.includes('サービス設定') || 
        lowerMessage.includes('service settings') ||
        lowerMessage.includes('設定について') ||
        lowerMessage.includes('サービスの設定') ||
        lowerMessage.includes('設定を教えて')) {
      return { helpRequested: true };
    }
    
    // Check for current settings request - more natural language variations
    if (lowerMessage.includes('設定確認') || 
        lowerMessage.includes('check settings') ||
        lowerMessage.includes('今の設定') ||
        lowerMessage.includes('現在の設定') ||
        lowerMessage.includes('設定は？') ||
        lowerMessage.includes('設定を見せて') ||
        lowerMessage.includes('設定を確認')) {
      return { settingsRequested: true };
    }
    
    // Detect negative feedback about service recommendations
    const negativePatterns = [
      // Direct negative feedback about services
      '要らない', 'いらない', '不要', '邪魔', '見たくない', '表示しないで', '非表示', '消して',
      '出さないで', '見せないで', 'うざい', 'うるさい', '迷惑', '必要ない', '止めて', 'やめて',
      // Negative reactions to service recommendations
      'そのサービスは', 'サービスは', 'リンクは', 'お役立ち情報は',
      // General negative expressions
      '興味ない', '関係ない', '気にしない', '無視して', '気にならない',
      // Subtle negative feedback
      '別に', 'どうでもいい', '必要ない', '見なくていい', '結構です', 'いいです', 'けっこうです'
    ];
    
    // More subtle negative patterns that might indicate disinterest
    const subtleNegativePatterns = [
      'わからない', '知らない', '使わない', '使えない', '役に立たない', '意味ない',
      '見ても', '読まない', '読めない', '難しい', '面倒', 'めんどう', 'めんどくさい'
    ];
    
    // Check if message contains negative feedback about services
    const hasServiceReference = lowerMessage.includes('サービス') || 
                               lowerMessage.includes('リンク') || 
                               lowerMessage.includes('お役立ち') || 
                               lowerMessage.includes('情報') ||
                               lowerMessage.includes('紹介');
                               
    const hasNegativeFeedback = negativePatterns.some(pattern => lowerMessage.includes(pattern));
    const hasSubtleNegativeFeedback = subtleNegativePatterns.some(pattern => lowerMessage.includes(pattern));
    
    // Check for explicit OFF commands
    if (lowerMessage.includes('サービス表示オフ') || 
        lowerMessage.includes('service off') ||
        lowerMessage.includes('サービス表示をオフにして') ||
        lowerMessage.includes('サービスを非表示') ||
        lowerMessage.includes('サービスを表示しないで') ||
        lowerMessage.includes('サービスオフ') ||
        lowerMessage.includes('表示オフ') ||
        lowerMessage.includes('サービス表示停止') ||
        lowerMessage.includes('サービス停止') ||
        lowerMessage.includes('サービスを停止')) {
      return this.updateUserPreferences(userId, { showServiceRecommendations: false });
    }
    
    // If message contains both service reference and negative feedback, turn off services
    if (hasServiceReference && hasNegativeFeedback) {
      return this.updateUserPreferences(userId, { showServiceRecommendations: false });
    }
    
    // If message contains both service reference and subtle negative feedback, reduce number of recommendations
    if (hasServiceReference && hasSubtleNegativeFeedback) {
      const currentPrefs = this.getUserPreferences(userId);
      // Reduce number of recommendations but don't turn off completely
      const newMaxRecs = Math.max(1, currentPrefs.maxRecommendations - 1);
      // Increase confidence threshold to show only more relevant services
      const newConfidence = Math.min(0.8, currentPrefs.minConfidenceScore + 0.1);
      
      return this.updateUserPreferences(userId, { 
        maxRecommendations: newMaxRecs,
        minConfidenceScore: newConfidence
      });
    }
    
    // Check for turning ON service recommendations - natural language variations
    if (lowerMessage.includes('サービス表示オン') || 
        lowerMessage.includes('service on') ||
        lowerMessage.includes('サービス表示をオンにして') ||
        lowerMessage.includes('サービスを表示して') ||
        lowerMessage.includes('サービスを見せて') ||
        lowerMessage.includes('サービスを出して') ||
        lowerMessage.includes('サービスを表示してください') ||
        lowerMessage.includes('サービスが見たい') ||
        lowerMessage.includes('サービスを教えて') ||
        // Additional natural language variations for Japanese speakers
        lowerMessage.includes('サービスオン') ||
        lowerMessage.includes('表示オン') ||
        lowerMessage.includes('サービス表示開始') ||
        lowerMessage.includes('サービス再開') ||
        lowerMessage.includes('サービスを再開') ||
        lowerMessage.includes('おすすめサービス') ||
        lowerMessage.includes('サービスをおすすめ') ||
        lowerMessage.includes('役立つサービス') ||
        lowerMessage.includes('サービスを再表示') ||
        lowerMessage.includes('何かいいサービス')) {
      return this.updateUserPreferences(userId, { showServiceRecommendations: true });
    }
    
    // Check for max recommendations adjustment - more flexible pattern matching
    // Look for patterns like "サービスを3つ表示" or "3つのサービスを見せて" or "サービス数3"
    const maxRecRegex = /サービス数(\d+)|service (\d+)|(\d+)つのサービス|サービスを(\d+)つ|(\d+)個のサービス|サービスを(\d+)個/i;
    const maxRecMatch = lowerMessage.match(maxRecRegex);
    if (maxRecMatch) {
      // Find the first non-undefined capture group that contains the number
      const capturedGroups = maxRecMatch.slice(1);
      const numberStr = capturedGroups.find(group => group !== undefined);
      const count = parseInt(numberStr);
      
      if (!isNaN(count) && count >= 0 && count <= 5) {
        return this.updateUserPreferences(userId, { maxRecommendations: count });
      }
    }
    
    // Check for confidence threshold adjustment - more flexible pattern matching
    // Look for patterns like "信頼度80%" or "80%以上の信頼度" or "信頼度を80にして"
    const confidenceRegex = /信頼度(\d+)|confidence (\d+)|(\d+)[%％]の信頼度|信頼度[をは](\d+)|(\d+)[%％]以上/i;
    const confidenceMatch = lowerMessage.match(confidenceRegex);
    if (confidenceMatch) {
      // Find the first non-undefined capture group that contains the number
      const capturedGroups = confidenceMatch.slice(1);
      const numberStr = capturedGroups.find(group => group !== undefined);
      const percentage = parseInt(numberStr);
      
      if (!isNaN(percentage) && percentage >= 40 && percentage <= 90) {
        return this.updateUserPreferences(userId, { minConfidenceScore: percentage / 100 });
      }
    }
    
    return null;
  }
  
  // Track user interaction with a service
  recordServiceInteraction(userId, serviceId, interactionType) {
    if (!this.preferences[userId]) {
      this.preferences[userId] = { ...this.defaultPreferences };
    }
    
    if (!this.preferences[userId].serviceInteractions) {
      this.preferences[userId].serviceInteractions = {};
    }
    
    if (!this.preferences[userId].serviceInteractions[serviceId]) {
      this.preferences[userId].serviceInteractions[serviceId] = {
        impressions: 0,
        clicks: 0,
        lastShown: null
      };
    }
    
    const interaction = this.preferences[userId].serviceInteractions[serviceId];
    
    if (interactionType === 'impression') {
      interaction.impressions++;
      interaction.lastShown = Date.now();
    } else if (interactionType === 'click') {
      interaction.clicks++;
    }
    
    this._savePreferences();
  }
}

// Initialize user preferences
const userPreferences = new UserPreferences();

// Record a service recommendation
async function recordServiceRecommendation(userId, serviceId, confidenceScore) {
  try {
    // Use the serviceRecommender's recordRecommendation method
    await serviceRecommender.recordRecommendation(userId, serviceId);
    
    // Also record this as an impression in user preferences
    userPreferences.recordServiceInteraction(userId, serviceId, 'impression');
    
    console.log(`Recorded recommendation for user ${userId}, service ${serviceId} with confidence ${confidenceScore}`);
  } catch (error) {
    console.error('Error recording service recommendation:', error);
  }
}

