const fs = require("fs"); const content = fs.readFileSync("server.js", "utf8"); const modified = content.replace(/        if \(model === .gpt-4o-latest.\) \{
          messages\.push\(\{
            role: .system.,
            content: mlSystemPrompt
          \}\);
        \} else \{
          \/\/ For Claude, append to the first message content
          messages\[0\]\.content \+= `.\n\n# ML分析結果からの追加コンテキスト\n\$\{mlSystemPrompt\}`;
        \}/, "        messages.push({
          role: \"system\",
          content: mlSystemPrompt
        });"); fs.writeFileSync("server.js", modified);
