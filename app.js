require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const Airtable = require('airtable');

console.log("Starting code with summary, analysis, career plans, and no direct echo...");

if (!process.env.CHANNEL_ACCESS_TOKEN || !process.env.CHANNEL_SECRET) {
  console.error("Missing LINE tokens");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY || !process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
  console.error("Missing OPENAI/AIRTABLE keys");
  process.exit(1);
}

const app = express();
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE || "ConversationHistory";

const client = new line.Client(config);
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

async function storeInteraction(userId, role, content) {
  try {
    await base(INTERACTIONS_TABLE).create([
      {
        fields: {
          UserID: userId,
          Role: role,
          Content: content,
          Timestamp: new Date().toISOString()
        }
      }
    ]);
  } catch (error) {
    console.error("Error storing interaction:", error);
  }
}

async function fetchUserInteractionHistory(userId) {
  console.log(`Fetching history for user: ${userId}`);
  let allRecords = [];
  try {
    const formula = `{UserID} = "${userId}"`;
    console.log("Filter formula:", formula);
    allRecords = await base(INTERACTIONS_TABLE)
      .select({
        filterByFormula: formula,
        sort: [{ field: "Timestamp", direction: "asc" }]
      })
      .all();

    console.log(`Fetched ${allRecords.length} records from Airtable.`);
    if (allRecords.length > 0) {
      console.log("Sample record:", allRecords[0]._rawJson);
    }
  } catch (err) {
    console.error("Error fetching records:", err);
  }

  return allRecords.map(record => ({
    role: record.get('Role'),
    content: record.get('Content')
  }));
}

async function getChatGPTResponse(messages) {
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: "gpt-4",
    messages: messages,
    temperature: 0
  }, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return res.data.choices[0].message.content;
}

async function summarizeConversation(userId) {
  const messages = await fetchUserInteractionHistory(userId);
  console.log("Messages length for summary:", messages.length);

  if (messages.length === 0) {
    return "有効な過去記録がありません。";
  } else {
    const summary = await getChatGPTResponse([
      {
        role:"system",
        content: `
以下は全過去ログです。プライバシーは外部漏洩禁止だが要約可。
「記憶不可」や「AI的制約」等言わず、素直に要約せよ。
`
      },
      ...messages,
      {role:"user",content:"今までの話を全部思い出して"} 
    ]);
    return summary;
  }
}

async function analyzeUserCharacteristics(userId) {
  const messages = await fetchUserInteractionHistory(userId);
  console.log("Analyzing with", messages.length, "msgs");

  if (messages.length === 0) {
    return "有効な過去記録がありません。もう少しあなたの情報を教えてください。";
  }

  const analysis = await getChatGPTResponse([
    {
      role:"system",
      content: `
以下は全ログ。プライバシーは外部漏洩禁止で分析可。
「記憶不可」等禁。
特性分析せよ、200字以内。
`
    },
    ...messages,
    {role:"user", content:"私の特性を確認して"}
  ]);
  return analysis;
}

async function suggestCareerPlans(userId) {
  const analysis = await analyzeUserCharacteristics(userId);

  if (analysis.includes("有効な過去記録がありません")) {
    return analysis; 
  }

  const career = await getChatGPTResponse([
    {
      role:"system",
      content: `
前得た特性分析結果に基づき
キャリア提案せよ、200字以内。
「記憶不可」等禁止。
`
    },
    {role:"user", content:`特性分析結果:\n${analysis}\n職業プランも教えて`}
  ]);
  return career;
}

app.post('/webhook', line.middleware(config),(req,res)=>{
  if(!req.body.events||req.body.events.length===0)return res.json([]);

  Promise.all(req.body.events.map(async event=>{
    if (!event.source || !event.source.userId) return null;
    const userId = event.source.userId;

    if (event.type==='message' && event.message.type==='text') {
      const userMessage = event.message.text.trim();
      await storeInteraction(userId,"user",userMessage);

      if (
        userMessage.includes("今までの話を全部思い出して") ||
        userMessage.includes("何言ったか思い出して") ||
        userMessage.includes("要約")
      ) {
        // Summarize
        const summary = await summarizeConversation(userId);
        return client.replyMessage(event.replyToken, {type:'text', text:summary});
      } else if (userMessage.includes("私の特性")) {
        // Characteristic analysis
        const analysis = await analyzeUserCharacteristics(userId);
        return client.replyMessage(event.replyToken,{type:'text', text:analysis});
      } else if (userMessage.includes("職業プラン") || userMessage.includes("キャリア")) {
        // Career suggestions
        const career = await suggestCareerPlans(userId);
        return client.replyMessage(event.replyToken,{type:'text', text:career});
      } else {
        // Fallback: Generate a short supportive message from GPT
        const fallbackResponse = await getChatGPTResponse([
          {
            role:"system",
            content: `
ユーザーが特定の要望(要約、特性、職業プラン)を出していない場合、
過去ログ使わずとも短い共感的メッセージを返せ。
「記憶不可」や「AI的制約」言わず、200字以内。`
          },
          {role:"user", content:userMessage}
        ]);

        return client.replyMessage(event.replyToken, {type:'text', text:fallbackResponse});
      }
    }
    return null;
  }))
  .then(result=>res.json(result))
  .catch(err=>{console.error(err);res.status(500).end();});
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>{
  console.log(`Server on ${PORT}`);
});