require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const Airtable = require('airtable');

// Environment Variables
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  OPENAI_API_KEY,
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  INTERACTIONS_TABLE = "ConversationHistory"
} = process.env;

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
  console.error("Missing LINE tokens");
  process.exit(1);
}
if (!OPENAI_API_KEY || !AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing OPENAI/AIRTABLE keys");
  process.exit(1);
}

const config = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};

const client = new line.Client(config);
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

const app = express();

// IMPORTANT: Do NOT use express.json() before line.middleware!
// The line.middleware must receive the raw body to validate the request signature.

// Simple auth placeholder
function isAuthenticated(userId) {
  return true;
}

// Content filter
async function contentFilterCheck(userMessage) {
  try {
    const response = await axios.post("https://api.openai.com/v1/moderations", {
      input: userMessage
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return !response.data.results[0].flagged;
  } catch (err) {
    console.error("Content filter error:", err);
    return true;
  }
}

async function getChatGPTResponse(messages) {
  const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: "gpt-4",
    messages: messages,
    temperature: 0
  }, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return openaiResponse.data.choices[0].message.content.trim();
}

async function storeInteraction(userId, role, content) {
  try {
    await base(INTERACTIONS_TABLE).create([{
      fields: {
        UserID: userId,
        Role: role,
        Content: content,
        Timestamp: new Date().toISOString()
      }
    }]);
  } catch (error) {
    console.error("Error storing interaction:", error);
  }
}

async function fetchUserInteractionHistory(userId) {
  try {
    const allRecords = await base(INTERACTIONS_TABLE)
      .select({
        filterByFormula: `{UserID} = "${userId}"`,
        sort: [{ field: "Timestamp", direction: "asc" }]
      })
      .all();
    return allRecords.map(record => ({
      role: record.get('Role'),
      content: record.get('Content')
    }));
  } catch (err) {
    console.error("Error fetching records:", err);
    return [];
  }
}

async function classifyUserMessage(userMessage) {
  if (userMessage.includes("意味")) return "意味確認";
  if (userMessage.includes("要約")) return "要約";
  if (userMessage.includes("特性") || userMessage.includes("キャリア")) return "その他";
  return "愚痴/雑談";
}

async function summarizeConversation(userId) {
  const messages = await fetchUserInteractionHistory(userId);
  if (messages.length === 0) {
    return "有効な過去記録がありません。";
  }
  const summary = await getChatGPTResponse([
    { role:"system", content:"あなたはメモリを持ち、以下が全ログです。要約してください。" },
    ...messages,
    { role:"user", content:"今までの話を全部思い出して" }
  ]);
  return summary;
}

async function analyzeUserCharacteristics(userId) {
  const messages = await fetchUserInteractionHistory(userId);
  if (messages.length === 0) return "有効な過去記録がありません。";

  const analysis = await getChatGPTResponse([
    { role:"system", content:"以下がユーザーの全記録。ユーザー特性を簡潔に分析してください。" },
    ...messages,
    { role:"user", content:"私の特性を確認して" }
  ]);
  return analysis;
}

async function suggestCareerPlans(userId) {
  const analysis = await analyzeUserCharacteristics(userId);
  if (analysis.includes("有効な過去記録")) return analysis;

  const career = await getChatGPTResponse([
    { role:"system", content:"以下分析結果に基づき、ユーザーに合いそうな職業プランを提案してください。" },
    { role:"user", content:`特性分析結果:\n${analysis}\n職業プランも教えて` }
  ]);
  return career;
}

async function handleEvent(event) {
  const userId = event.source.userId;
  if (!isAuthenticated(userId)) {
    return {type:'text', text:'認証が必要です。'};
  }

  if (event.type==='message' && event.message.type==='text') {
    const userMessage = event.message.text.trim();
    const isSafe = await contentFilterCheck(userMessage);
    if (!isSafe) return {type:'text', text:'不適切な内容です。'};

    await storeInteraction(userId,"user",userMessage);
    const classification = await classifyUserMessage(userMessage);

    if (classification==="意味確認") {
      const response = await getChatGPTResponse([
        {role:"system", content:"ユーザーは意味確認をしています。短く回答"},
        {role:"user", content:userMessage}
      ]);
      await storeInteraction(userId, "assistant", response);
      return { type:'text', text:response };
    } else if (classification==="愚痴/雑談") {
      const response = await getChatGPTResponse([
        {role:"system", content:"ユーザーは雑談/愚痴中。共感的な短い応答を生成。"},
        {role:"user", content:userMessage}
      ]);
      await storeInteraction(userId, "assistant", response);
      return { type:'text', text:response };
    } else if (classification==="要約") {
      const summary = await summarizeConversation(userId);
      await storeInteraction(userId,"assistant", summary);
      return { type:'text', text:summary };
    } else {
      // 特性/キャリア等
      if (userMessage.includes("特性")) {
        const analysis = await analyzeUserCharacteristics(userId);
        await storeInteraction(userId, "assistant", analysis);
        return { type:'text', text:analysis };
      } else if (userMessage.includes("キャリア")) {
        const career = await suggestCareerPlans(userId);
        await storeInteraction(userId, "assistant", career);
        return { type:'text', text:career };
      } else {
        // fallback
        const response = await getChatGPTResponse([
          {role:"system",content:"ユーザーはその他要求。短く有用な応答を。"},
          {role:"user",content:userMessage}
        ]);
        await storeInteraction(userId,"assistant",response);
        return { type:'text',text:response };
      }
    }
  }

  return null;
}

// Define the webhook endpoint without app.use(express.json())
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    if (!req.body.events || req.body.events.length === 0) {
      return res.json([]); // Return 200 with empty array
    }

    const results = await Promise.all(req.body.events.map(handleEvent));
    return res.json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
});

// Listen on PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server on ${PORT}`);
});