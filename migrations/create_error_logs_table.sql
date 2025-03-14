-- エラーログテーブルの作成
CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    error_message TEXT NOT NULL,
    error_type VARCHAR(50) NOT NULL,
    stack_trace TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    context JSONB
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);

-- コメントの追加
COMMENT ON TABLE error_logs IS '機械学習システムのエラーログを保存するテーブル';
COMMENT ON COLUMN error_logs.error_message IS 'エラーメッセージ';
COMMENT ON COLUMN error_logs.error_type IS 'エラーの種類';
COMMENT ON COLUMN error_logs.stack_trace IS 'スタックトレース';
COMMENT ON COLUMN error_logs.severity IS 'エラーの重要度（error, warning, info）';
COMMENT ON COLUMN error_logs.context IS 'エラーが発生した際のコンテキスト情報';

-- テーブル一覧の確認
SELECT tablename FROM pg_catalog.pg_tables 
WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';

-- 機械学習トレーニングデータの確認
SELECT * FROM intent_training_data LIMIT 5;

-- モデルバージョン情報の確認
SELECT version, description, accuracy, is_active FROM intent_model_versions; 