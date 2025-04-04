// logger.js
const fs = require('fs');
const path = require('path');
const util = require('util');

const logFilePath = path.join(__dirname, 'detailed_app_trace.log');

// ログファイルへの書き込みストリームを作成 (追記モード)
// エラーハンドリングを追加して、書き込みエラー時にクラッシュしないようにする
let logStream;
try {
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    logStream.on('error', (err) => {
        console.error('詳細ログファイルへの書き込みエラー:', err);
        // ストリームを閉じて再試行するか、あるいは何もしないかを選択
        // ここではシンプルにエラーを出力するだけにする
    });
} catch (err) {
    console.error('詳細ログファイルのストリーム作成エラー:', err);
}


const logLevels = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

// 現在のログレベル（環境変数またはデフォルト）
// Herokuのデフォルトでは 'INFO' になるように調整
const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
const currentLogLevel = logLevels[envLogLevel] !== undefined ? logLevels[envLogLevel] : logLevels.INFO;
console.log(`[Logger] Initializing logger with level: ${Object.keys(logLevels).find(key => logLevels[key] === currentLogLevel)} (${currentLogLevel})`);


function formatLogMessage(level, prefix, message, data) {
    const timestamp = new Date().toISOString();
    let logEntry = `${timestamp} [${level}] ${prefix ? '[' + prefix + '] ' : ''}${message}`;

    if (data !== undefined && data !== null) { // Check if data is provided
        try {
            // オブジェクトや配列を整形して出力、循環参照を避ける
            const dataString = util.inspect(data, { depth: 3, colors: false, breakLength: Infinity });
            // 長すぎるデータは切り詰める
            const truncatedData = dataString.length > 1000 ? dataString.substring(0, 1000) + '...' : dataString;
            logEntry += `\nData: ${truncatedData}`;
        } catch (e) {
            logEntry += `\nData: [Serialization Error: ${e.message}]`;
        }
    }
    return logEntry + '\n'; // Ensure newline at the end
}

function logToFile(logEntry) {
    if (logStream && logStream.writable) {
        try {
            logStream.write(logEntry);
        } catch (err) {
             // createWriteStreamのエラーハンドラで処理されるはずだが念のため
            console.error('[Logger Error] Failed to write to detailed log file stream:', err);
        }
    } else {
        // ストリームが利用できない場合はコンソールエラー
         console.error('[Logger Error] Log stream not available. Cannot write detailed log.');
         // Fallback to console.log for the message itself if stream fails
         console.log('[Logger Fallback] ', logEntry.trim());
    }
}

const logger = {
    debug: (prefix, message, data) => {
        if (currentLogLevel <= logLevels.DEBUG) {
            const logEntry = formatLogMessage('DEBUG', prefix, message, data);
            logToFile(logEntry);
            // DEBUGログもコンソールに出力（Herokuで見やすくするため）
            // console.log(`[DEBUG] ${prefix ? '[' + prefix + '] ' : ''}${message}`, data || '');
        }
    },
    info: (prefix, message, data) => {
        if (currentLogLevel <= logLevels.INFO) {
             const logEntry = formatLogMessage('INFO', prefix, message, data);
             logToFile(logEntry);
        }
    },
    warn: (prefix, message, data) => {
        if (currentLogLevel <= logLevels.WARN) {
            const logEntry = formatLogMessage('WARN', prefix, message, data);
            logToFile(logEntry);
            // WARN以上はコンソールにも出す
            console.warn(`[WARN] ${prefix ? '[' + prefix + '] ' : ''}${message}`, data || '');
        }
    },
    error: (prefix, message, error) => {
        if (currentLogLevel <= logLevels.ERROR) {
             // エラーオブジェクトはスタックトレースを含めて整形
             let errorData = error;
             if (error instanceof Error) {
                 // Convert Error object to a plain object for better logging
                 errorData = { message: error.message, stack: error.stack, name: error.name };
                 // Add custom properties if any
                 Object.keys(error).forEach(key => {
                     if (!['message', 'stack', 'name'].includes(key)) {
                         errorData[key] = error[key];
                     }
                 });
             }
            const logEntry = formatLogMessage('ERROR', prefix, message, errorData);
            logToFile(logEntry);
             // ERRORはコンソールにも出す
            console.error(`[ERROR] ${prefix ? '[' + prefix + '] ' : ''}${message}`, error || '');
        }
    },
    // ストリームを閉じる関数（アプリケーション終了時に呼ぶ）
    close: () => {
        if (logStream) {
            console.log('[Logger] Closing log stream...');
            logStream.end(() => {
                console.log('[Logger] Log stream closed.');
                logStream = null; // Avoid trying to close again
            });
        }
    }
};

// アプリケーション終了時にログストリームを閉じる
// Ensure cleanup happens gracefully
let isClosing = false;
const cleanup = () => {
    if (!isClosing) {
        isClosing = true;
        logger.close();
        // Allow time for the stream to close before exiting
        setTimeout(() => process.exit(), 500);
    }
};

process.on('exit', cleanup);
process.on('SIGINT', cleanup); // Ctrl+C
process.on('SIGTERM', cleanup); // kill command
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception] Shutting down...', err);
  logger.error('UNCAUGHT_EXCEPTION', 'Uncaught exception occurred', err);
  cleanup();
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] Shutting down...', reason);
  logger.error('UNHANDLED_REJECTION', 'Unhandled promise rejection', { reason });
  cleanup();
});


module.exports = logger; 