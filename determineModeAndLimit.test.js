// determineModeAndLimit.test.js

// server.js からテスト対象の関数や定数をインポート
const {
    determineModeAndLimit,
    cosineSimilarity,
    MODE_LIMITS
    // MODE_VECTORS はここでは require しない ★★★ 変更点 ★★★
} = require('./server'); // Ensure this path is correct
        // このヘルパー関数を追加
        const createSparseVector = (index, value = 0.9, length = 1536) => {
            const vector = Array(length).fill(0);
            if (index >= 0 && index < length) {
              // 類似度が高くなるように、関連するモードのインデックスに高い値を入れる
              // MODE_VECTORS の順序に合わせてインデックスを指定
              // 0: career, 1: memoryTest, 2: characteristics, 3: memoryRecall,
              // 4: humanRelationship, 5: share, 6: deepExploration
              vector[index] = value;
            }
            // 少しノイズを加える（完全に一致しないように）
            for(let i = 0; i < 10; i++) {
                const randomIndex = Math.floor(Math.random() * length);
                if (randomIndex !== index) {
                    vector[randomIndex] = Math.random() * 0.1; // 小さなノイズ
                }
            }
            return vector;
          };
// OpenAI APIのモック(模擬)設定
const { OpenAI } = require('openai'); // Import the actual library

// Mock the OpenAI library
// determineModeAndLimit.test.js の該当箇所を置き換え

// Mock the OpenAI library
jest.mock('openai', () => {
    // mockEmbeddingsCreate は個別の mockImplementation で直接使われるので、
    // ここで事前に jest.fn() を定義する必要はなくなりました。
    // const mockEmbeddingsCreate = jest.fn(); // ← この行は削除してもOK

    return {
        OpenAI: jest.fn().mockImplementation(() => ({
            embeddings: {
                // 'create' プロパティに直接、新しい mockImplementation を割り当てる
                create: jest.fn().mockImplementation(async ({ input }) => { // jest.fn() でラップする
                    let embedding;
                    console.log(`Mocking embedding for input: "${input}"`); // デバッグ用にログ出力

                    // 各テストケースの入力文字列に応じて、対応するモードに近いベクトルを返す
                    // (ここは前回の修正内容と同じ)
                    if (input.includes("仕事のキャリア") || input.includes("転職") || input.includes("適職診断")) { // career
                      embedding = createSparseVector(0);
                      console.log(" -> Mocking as career vector");
                    } else if (input.includes("昨日の夕食") || input.includes("思い出す") || input.includes("前に話したこと覚えてる")) { // memoryRecall
                      embedding = createSparseVector(3);
                       console.log(" -> Mocking as memoryRecall vector");
                    } else if (input.includes("あなたの性格") || input.includes("私の特徴") || input.includes("性格を分析して")) { // characteristics
                       embedding = createSparseVector(2);
                       console.log(" -> Mocking as characteristics vector");
                    } else if (input.includes("テストだよ") || input.includes("記憶力")) { // memoryTest - 条件見直し推奨
                       embedding = createSparseVector(1);
                       console.log(" -> Mocking as memoryTest vector");
                    } else if (input.includes("人間関係") || input.includes("友達") || input.includes("友人関係の悩み")) { // humanRelationship
                      embedding = createSparseVector(4);
                      console.log(" -> Mocking as humanRelationship vector");
                    } else if (input.includes("共有したい") || input.includes("シェア") || input.includes("すごく助かったよ")) { // share
                      embedding = createSparseVector(5);
                      console.log(" -> Mocking as share vector");
                    } else if (input.includes("深く掘り下げて") || input.includes("もっと詳しく") || input.includes("理論についてもっと詳しく")) { // deepExploration
                      embedding = createSparseVector(6);
                      console.log(" -> Mocking as deepExploration vector");
                    } else if (input.includes("完全に無関係な話題")) {
                        embedding = Array(1536).fill(0.001);
                        console.log(" -> Mocking as general/low similarity vector (unrelated topic)");
                    } else { // general または不明な入力
                      embedding = Array(1536).fill(0.001);
                      console.log(" -> Mocking as general/low similarity vector (default)");
                    }

                    // 次元数チェック (念のため)
                    if (!embedding || embedding.length !== 1536) {
                       console.warn(`  [MOCK API WARN] Generated mock vector had unexpected length (${embedding?.length}). Resetting to 1536 zeros.`);
                       embedding = Array(1536).fill(0);
                    }

                    // API応答形式
                    return {
                         usage: { prompt_tokens: 10, total_tokens: 10 },
                         data: [{ embedding: embedding }],
                         model: "text-embedding-ada-002",
                         object: "list"
                      };
                }) // ここが create に割り当てられる mockImplementation の終わり
            } // embeddings オブジェクトの終わり
        })) // OpenAI の mockImplementation の終わり
    }; // return ステートメントの終わり
}); // jest.mock の終わり
            

// describe ブロック以下は変更なし...

// --- Test Suite Starts Here ---
describe('determineModeAndLimit Function Tests (Embedding Based)', () => {

    // Test Case 1: Career-related message
    test('should return "career" mode for career-related messages', async () => {
        const message = "私の適職診断をお願いします。キャリアについて相談したいです。";
        const expectedMode = 'career';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 1 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 1 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

    // Test Case 2: Memory test message
    test('should return "memoryTest" mode for memory test messages', async () => {
        const message = "ねえ、前に話したこと覚えてる？";
        const expectedMode = 'memoryTest';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 2 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 2 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

    // Test Case 3: Characteristics analysis message
    test('should return "characteristics" mode for characteristic analysis messages', async () => {
        const message = "私の性格を分析してほしいな。";
        const expectedMode = 'characteristics';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 3 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 3 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

     // Test Case 4: Memory recall message
     test('should return "memoryRecall" mode for memory recall messages', async () => {
        const message = "今までの会話を要約してくれる？";
        const expectedMode = 'memoryRecall';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 4 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 4 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

    // Test Case 5: Human relationship message
    test('should return "humanRelationship" mode for human relationship messages', async () => {
        const message = "最近、友人関係の悩みがあって…";
        const expectedMode = 'humanRelationship';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 5 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 5 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

    // Test Case 6: Sharing/appreciation message
    test('should return "share" mode for sharing/appreciation messages', async () => {
        const message = "Adam、すごく助かったよ、ありがとう！";
        const expectedMode = 'share';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 6 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 6 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

     // Test Case 7: Deep exploration message
     test('should return "deepExploration" mode for deep exploration messages', async () => {
        const message = "その理論についてもっと詳しく教えてくれない？";
        const expectedMode = 'deepExploration';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 7 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 7 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

    // Test Case 8: General greeting
    test('should return "general" mode for general greetings', async () => {
        const message = "こんにちは！元気ですか？";
        const expectedMode = 'general';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 8 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 8 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

     // Test Case 9: Ambiguous message (expecting fallback to general)
     test('should return "general" mode for ambiguous messages below threshold', async () => {
        const message = "完全に無関係な話題です。"; // Mock should return a dissimilar vector
        const expectedMode = 'general';
        const expectedLimit = MODE_LIMITS[expectedMode];

        console.log(`\n[Test 9 Input] "${message}"`);
        const result = await determineModeAndLimit(message);
        console.log(`[Test 9 Result] Mode: ${result.mode}, Limit: ${result.limit}`);

        expect(result.mode).toBe(expectedMode);
        expect(result.limit).toBe(expectedLimit);
    });

    // TODO: Add more test cases for edge cases, longer/shorter messages, etc.

}); // End of describe block
