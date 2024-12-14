require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const Airtable = require('airtable');

// Load env vars
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  OPENAI_API_KEY,
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID
} = process.env;

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET || !OPENAI_API_KEY || !AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const config = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};

const client = new line.Client(config);

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

const app = express();

// No app.use(express.json()) before line.middleware!
// line middleware needs raw body.
app.post('/webhook', line.middleware(config), async (req, res) => {
  if (!req.body.events || req.body.events.length === 0) {
    return res.json([]);
  }

  const results = await Promise.all(req.body.events.map(handleEvent));
  return res.json(results);
});

async function handleEvent(event) {
  // Only process message events with text
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();
  const replyToken = event.replyToken;

  // Content filter check (OpenAI Moderation)
  const isSafe = await contentFilterCheck(userMessage);
  if (!isSafe) {
    await client.replyMessage(replyToken, { type: 'text', text: '不適切な内容です。' });
    return { success: true };
  }

  // Store user message to Airtable
  await storeInteraction(userId, "user", userMessage);

  // Classification
  const classification = await classifyUserMessage(userMessage);

  if (classification === "意味確認") {
    // Meaning confirmation (e.g. user asks for explanation)
    const response = await simpleOpenAIResponse("User asked meaning confirmation: " + userMessage);
    await client.replyMessage(replyToken, { type:'text', text: response });
  } else if (classification === "愚痴/雑談") {
    // small talk or venting
    const response = await simpleOpenAIResponse("User is small talking: " + userMessage);
    await client.replyMessage(replyToken, { type:'text', text: response });
  } else if (classification === "要約") {
    // summarize conversation
    const summary = await summarizeConversation(userId);
    await client.replyMessage(replyToken, { type:'text', text: summary });
  } else {
    // その他: Possibly characteristic analysis or career suggestion based on user’s request
    if (userMessage.includes("特性")) {
      const analysis = await analyzeUserCharacteristics(userId);
      await client.replyMessage(replyToken, { type:'text', text: analysis });
    } else if (userMessage.includes("職業プラン")) {
      const career = await suggestCareerPlans(userId);
      await client.replyMessage(replyToken, { type:'text', text: career });
    } else {
      // Default echo if nothing matches
      await client.replyMessage(replyToken, { type:'text', text: `分かりました。「${userMessage}」ですね。`});
    }
  }

  return { success:true };
}

// Fetch user logs from Airtable
async function fetchUserInteractionHistory(userId) {
  let allRecords = [];
  try {
    const formula = `{UserID} = "${userId}"`;
    const records = await base('ConversationHistory').select({
      filterByFormula: formula,
      sort: [{ field: "Timestamp", direction: "asc"}]
    }).all();
    allRecords = records.map(r => ({
      role: r.get('Role'),
      content: r.get('Content')
    }));
  } catch (err) {
    console.error("Fetching records error:", err);
  }
  return allRecords;
}

// Summarize conversation
async function summarizeConversation(userId) {
  const messages = await fetchUserInteractionHistory(userId);
  if (messages.length === 0) {
    return "有効な過去記録がありません。";
  }

  const prompt = `以下はユーザーとの全会話です。要約して下さい。:\n${messages.map(m=>`${m.role}:${m.content}`).join("\n")}`;
  const summary = await simpleOpenAIResponse(prompt);
  return summary;
}

// Analyze user characteristics
async function analyzeUserCharacteristics(userId) {
  const messages = await fetchUserInteractionHistory(userId);
  if (messages.length === 0) {
    return "有効な過去記録がありません。";
  }
  const prompt = `以下の会話ログからユーザーの特性を分析してください:\n${messages.map(m=>`${m.role}:${m.content}`).join("\n")}`;
  const analysis = await simpleOpenAIResponse(prompt);
  return analysis;
}

// Suggest career plans
async function suggestCareerPlans(userId) {
  const analysis = await analyzeUserCharacteristics(userId);
  const prompt = `これがユーザーの特性分析結果:\n${analysis}\nこれに基づいてキャリアプランを提案して下さい。`;
  const career = await simpleOpenAIResponse(prompt);
  return career;
}

// Classify user message using a simple prompt
async function classifyUserMessage(userMessage) {
  const prompt = `ユーザーの発話：「${userMessage}」\n以下のカテゴリから1つ選ぶ: 意味確認, 愚痴/雑談, 要約, その他`;
  const response = await simpleOpenAIResponse(prompt);
  const result = response.trim();
  if (["意味確認","愚痴/雑談","要約","その他"].includes(result)) {
    return result;
  }
  return "愚痴/雑談";
}

// Simple OpenAI response
async function simpleOpenAIResponse(prompt) {
  const openaiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
    model:"gpt-4",
    messages: [{role:"system", content:"簡潔に日本語で回答"}, {role:"user", content: prompt}],
    temperature:0
  }, {
    headers:{
      "Authorization":`Bearer ${OPENAI_API_KEY}`,
      "Content-Type":"application/json"
    }
  });
  return openaiResponse.data.choices[0].message.content;
}

// Content filter check
async function contentFilterCheck(userMessage) {
  try {
    const resp = await axios.post("https://api.openai.com/v1/moderations", {
      input:userMessage
    },{
      headers:{
        "Authorization":`Bearer ${OPENAI_API_KEY}`,
        "Content-Type":"application/json"
      }
    });
    return !resp.data.results[0].flagged;
  } catch(e) {
    console.error("Content filter error", e);
    return true;
  }
}

// Store interaction to Airtable
async function storeInteraction(userId, role, content) {
  try {
    await base('ConversationHistory').create([
      {
        fields:{
          UserID: userId,
          Role: role,
          Content: content,
          Timestamp: new Date().toISOString()
        }
      }
    ]);
  } catch(e) {
    console.error("Error storing interaction:", e);
  }
}

const PORT = process.env.PORT||3000;
app.listen(PORT,()=>{
  console.log(`Server listening on port ${PORT}`);
});