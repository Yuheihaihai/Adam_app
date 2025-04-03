    // generate_mode_vectors.js
    require('dotenv').config(); // .envファイルから環境変数を読み込む
    const { OpenAI } = require('openai');

    // 環境変数からAPIキーを読み込む
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("エラー: OPENAI_API_KEY が .env ファイルまたは環境変数に設定されていません。");
        process.exit(1);
    }

    const openai = new OpenAI({ apiKey });

    const phrases = {
        career: "仕事のキャリアについて相談したい",
        memoryTest: "前に話したことを覚えていますか？",
        characteristics: "私の性格や特徴を分析してください",
        memoryRecall: "これまでの会話の要点をまとめて",
        humanRelationship: "友人関係で悩んでいます",
        share: "ありがとう、とても助かりました！",
        deepExploration: "それについてもっと深く掘り下げて説明して",
        general: "こんにちは"
    };

    // server.js で使用されているモデルを確認してください (例: text-embedding-3-small)
    const model = "text-embedding-3-small";
    // モデルによっては次元数の指定が必要な場合があります
    // const dimensions = 1536;

    async function generateVectors() {
        const vectors = {};
        console.log(`--- Embedding 生成開始 (Model: ${model}) ---`);
        for (const mode in phrases) {
            try {
                console.log(`  モード生成中: ${mode} ("${phrases[mode]}")`);
                const response = await openai.embeddings.create({
                    model: model,
                    input: phrases[mode],
                    // dimensions: dimensions // 必要に応じて次元数を指定
                });

                if (response && response.data && response.data[0] && response.data[0].embedding) {
                    vectors[mode] = response.data[0].embedding;
                    console.log(`    -> ベクトル生成完了 (次元数: ${vectors[mode].length})`);
                } else {
                     console.error(`    -> エラー: モード ${mode} のAPI応答形式が無効です。`);
                     vectors[mode] = Array(1536).fill(0.0); // フォールバック
                }
             } catch (error) {
                console.error(`    -> エラー: モード ${mode} のベクトル生成に失敗しました:`, error.message);
                vectors[mode] = Array(1536).fill(0.0); // エラー時のフォールバック
             }
             // レート制限を避けるために短い待機時間を追加 (必要に応じて調整)
             await new Promise(resolve => setTimeout(resolve, 200));
        }
        console.log("\n--- 生成されたベクトルデータ ---");
        // server.js にコピー＆ペーストしやすい形式で出力
        console.log("const MODE_VECTORS = {");
        for (const mode in vectors) {
            // 配列を文字列に変換 (スペースを削除してコンパクトに)
            const vectorString = `[${vectors[mode].join(',')}]`;
            console.log(`  ${mode}: ${vectorString},`);
        }
        console.log("};");
        console.log("\n--- 上記の 'const MODE_VECTORS = { ... };' を server.js の L801 付近に貼り付けてください ---");

        return vectors;
    }

    generateVectors();