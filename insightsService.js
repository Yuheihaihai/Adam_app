// insightsService.js - サーバーメトリクス追跡と洞察提供
const fs = require('fs');
const path = require('path');
const db = require('./db'); // データベース接続をインポート

class InsightsService {
  constructor() {
    this.dataPath = path.join(__dirname, 'data', 'insights');
    this.ensureDataDirectory();
    
    // 音声メッセージの制限設定（環境変数から読み込む、なければデフォルト値）
    this.audioLimits = {
      userDailyLimit: parseInt(process.env.VOICE_MESSAGE_DAILY_LIMIT || 3),  // 1日あたりのユーザー制限
      globalMonthlyLimit: parseInt(process.env.VOICE_MESSAGE_MONTHLY_LIMIT || 2000),  // 月あたりのグローバル制限
      quotaRemoved: false  // 総量規制解除フラグ
    };
    
    // メモリ内メトリクス（ランタイム用、定期的に永続化）
    this.metrics = this.loadMetrics();
    
    // 定期保存スケジュール（15分ごと）
    setInterval(() => this.saveMetrics(), 15 * 60 * 1000);

    // データベーステーブルの存在を確認
    this._ensureDatabaseTables();
  }

  // データベーステーブルの存在を確認
  async _ensureDatabaseTables() {
    try {
      // db.jsのinitializeTablesメソッドを呼び出し
      await db.initializeTables();
      console.log('InsightsService: データベーステーブルの存在を確認しました');
    } catch (error) {
      console.error('InsightsService: データベーステーブルの確認に失敗しました', error);
    }
  }
  
  // データディレクトリ確保
  ensureDataDirectory() {
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'));
    }
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath);
    }
  }
  
  // ユーザーメトリクスファイルパス
  getUserMetricsPath(userId) {
    return path.join(this.dataPath, `user_${userId}.json`);
  }
  
  // システムメトリクスファイルパス
  getSystemMetricsPath() {
    return path.join(this.dataPath, 'system_metrics.json');
  }
  
  // 音声設定ファイルパス
  getAudioLimitsPath() {
    return path.join(this.dataPath, 'audio_limits.json');
  }
  
  // メトリクスロード
  loadMetrics() {
    try {
      const systemPath = this.getSystemMetricsPath();
      const audioLimitsPath = this.getAudioLimitsPath();
      
      let systemMetrics = {
        totalRequests: 0,
        textRequests: 0,
        imageRequests: 0,
        audioRequests: 0,
        startTime: Date.now(),
        userCount: 0
      };
      
      if (fs.existsSync(systemPath)) {
        systemMetrics = JSON.parse(fs.readFileSync(systemPath, 'utf8'));
      }
      
      // 音声制限設定をロード
      if (fs.existsSync(audioLimitsPath)) {
        try {
          const savedLimits = JSON.parse(fs.readFileSync(audioLimitsPath, 'utf8'));
          // デフォルト値を上書き
          this.audioLimits = {
            ...this.audioLimits, // デフォルト値をベースに
            ...savedLimits       // 保存されている値で上書き
          };
          console.log('音声制限設定をロードしました:', this.audioLimits);
        } catch (error) {
          console.error('音声制限設定のロードに失敗しました:', error.message);
        }
      }
      
      return {
        system: systemMetrics,
        users: new Map() // ユーザーメトリクスはオンデマンドでロード
      };
    } catch (error) {
      console.error('メトリクスロードエラー:', error);
      return {
        system: {
          totalRequests: 0,
          textRequests: 0,
          imageRequests: 0,
          audioRequests: 0,
          startTime: Date.now(),
          userCount: 0
        },
        users: new Map()
      };
    }
  }
  
  // メトリクス保存
  saveMetrics() {
    try {
      // システムメトリクス保存
      fs.writeFileSync(
        this.getSystemMetricsPath(),
        JSON.stringify(this.metrics.system, null, 2)
      );
      
      // 音声制限設定を保存
      fs.writeFileSync(
        this.getAudioLimitsPath(),
        JSON.stringify(this.audioLimits, null, 2)
      );
      
      // アクティブユーザーメトリクスのみ保存（メモリ上にあるもの）
      for (const [userId, metrics] of this.metrics.users.entries()) {
        fs.writeFileSync(
          this.getUserMetricsPath(userId),
          JSON.stringify(metrics, null, 2)
        );
      }
      
      console.log('メトリクス保存完了');
    } catch (error) {
      console.error('メトリクス保存エラー:', error);
    }
  }
  
  // 特定ユーザーのメトリクスを取得（なければロード）
  async getUserMetrics(userId) {
    if (!this.metrics.users.has(userId)) {
      try {
        // まずデータベースからロードを試みる
        let dbMetricsFound = false;
        try {
          const dbResults = await db.query(
            'SELECT * FROM user_audio_stats WHERE user_id = $1',
            [userId]
          );
          
          if (dbResults && dbResults.length > 0) {
            const dbMetrics = dbResults[0];
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const lastResetDate = dbMetrics.last_reset_date ? dbMetrics.last_reset_date.toISOString().split('T')[0] : null;
            
            // データベースから基本情報を取得
            const metrics = {
              textRequests: 0,
              imageRequests: 0,
              audioRequests: dbMetrics.audio_requests_total || 0,
              audioRequestsToday: today === lastResetDate ? dbMetrics.audio_requests_today : 0,
              lastAudioRequestDate: dbMetrics.last_audio_request_date,
              lastConversationTimestamp: dbMetrics.last_conversation_timestamp,
              lastAudioNotificationDate: dbMetrics.last_audio_notification_date,
              totalInputLength: 0,
              longestInput: 0,
              shortestInput: Infinity,
              lastInputPreview: '',
              firstSeen: Date.now(),
              lastSeen: Date.now(),
              recentQueries: []
            };
            
            // メモリ内にロード
            this.metrics.users.set(userId, metrics);
            console.log(`ユーザー(${userId})の音声メトリクスをデータベースからロードしました`);
            dbMetricsFound = true;
          }
        } catch (dbError) {
          console.error(`データベースからの音声メトリクス取得エラー (${userId}):`, dbError.message);
        }

        // データベースになければファイルからロード（従来の方法）
        if (!dbMetricsFound) {
          const filePath = this.getUserMetricsPath(userId);
          if (fs.existsSync(filePath)) {
            this.metrics.users.set(userId, JSON.parse(fs.readFileSync(filePath, 'utf8')));
            
            // 音声リクエスト関連の項目が未設定の場合は初期化
            const userMetrics = this.metrics.users.get(userId);
            if (userMetrics.audioRequests === undefined) {
              userMetrics.audioRequests = 0;
            }
            if (userMetrics.audioRequestsToday === undefined) {
              userMetrics.audioRequestsToday = 0;
            }
            if (userMetrics.lastAudioRequestDate === undefined) {
              userMetrics.lastAudioRequestDate = null;
            }
            if (userMetrics.lastConversationTimestamp === undefined) {
              userMetrics.lastConversationTimestamp = null;
            }
            if (userMetrics.lastAudioNotificationDate === undefined) {
              userMetrics.lastAudioNotificationDate = null;
            }
          } else {
            // 新規ユーザー
            this.metrics.users.set(userId, {
              textRequests: 0,
              imageRequests: 0,
              audioRequests: 0,
              audioRequestsToday: 0,
              lastAudioRequestDate: null,
              lastConversationTimestamp: null,
              lastAudioNotificationDate: null,
              totalInputLength: 0,
              longestInput: 0,
              shortestInput: Infinity,
              lastInputPreview: '',
              firstSeen: Date.now(),
              lastSeen: Date.now(),
              recentQueries: []
            });
            this.metrics.system.userCount++;
          }
        }
      } catch (error) {
        console.error(`ユーザー(${userId})メトリクスロードエラー:`, error);
        // デフォルト値設定
        this.metrics.users.set(userId, {
          textRequests: 0,
          imageRequests: 0,
          audioRequests: 0,
          audioRequestsToday: 0,
          lastAudioRequestDate: null,
          lastConversationTimestamp: null,
          lastAudioNotificationDate: null,
          totalInputLength: 0,
          longestInput: 0,
          shortestInput: Infinity,
          lastInputPreview: '',
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          recentQueries: []
        });
      }
    }
    
    return this.metrics.users.get(userId);
  }
  
  // 特定ユーザーの音声メトリクスをデータベースに保存
  async saveUserAudioMetricsToDb(userId, metrics) {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      // UPSERTを使用して挿入または更新
      const query = `
        INSERT INTO user_audio_stats 
          (user_id, audio_requests_total, audio_requests_today, last_conversation_timestamp, 
           last_audio_request_date, last_audio_notification_date, last_reset_date, updated_at)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          audio_requests_total = $2,
          audio_requests_today = $3,
          last_conversation_timestamp = $4,
          last_audio_request_date = $5,
          last_audio_notification_date = $6,
          last_reset_date = $7,
          updated_at = NOW()
      `;
      
      await db.query(query, [
        userId,
        metrics.audioRequests || 0,
        metrics.audioRequestsToday || 0,
        metrics.lastConversationTimestamp,
        metrics.lastAudioRequestDate,
        metrics.lastAudioNotificationDate,
        today
      ]);
      
      console.log(`ユーザー(${userId})の音声メトリクスをデータベースに保存しました`);
      return true;
    } catch (error) {
      console.error(`ユーザー(${userId})の音声メトリクスデータベース保存エラー:`, error.message);
      return false;
    }
  }
  
  // テキストリクエスト追跡
  async trackTextRequest(userId, text) {
    const userMetrics = await this.getUserMetrics(userId);
    const textLength = text ? text.length : 0;
    
    // メトリクス更新
    userMetrics.textRequests++;
    userMetrics.lastSeen = Date.now();
    
    if (text) {
      userMetrics.totalInputLength += textLength;
      userMetrics.lastInputPreview = text.substring(0, 30) + (text.length > 30 ? '...' : '');
      
      if (textLength > userMetrics.longestInput) {
        userMetrics.longestInput = textLength;
      }
      
      if (textLength > 0 && textLength < userMetrics.shortestInput) {
        userMetrics.shortestInput = textLength;
      }
      
      // 最近のクエリ保存（最大5件）
      userMetrics.recentQueries.unshift({
        type: 'text',
        content: userMetrics.lastInputPreview,
        timestamp: Date.now()
      });
      if (userMetrics.recentQueries.length > 5) {
        userMetrics.recentQueries.pop();
      }
    }
    
    // システムメトリクス更新
    this.metrics.system.totalRequests++;
    this.metrics.system.textRequests++;
    
    return userMetrics;
  }
  
  // 画像リクエスト追跡
  async trackImageRequest(userId, promptText) {
    const userMetrics = await this.getUserMetrics(userId);
    
    userMetrics.imageRequests++;
    userMetrics.lastSeen = Date.now();
    
    if (promptText) {
      const preview = promptText.substring(0, 30) + (promptText.length > 30 ? '...' : '');
      userMetrics.recentQueries.unshift({
        type: 'image',
        content: preview,
        timestamp: Date.now()
      });
      if (userMetrics.recentQueries.length > 5) {
        userMetrics.recentQueries.pop();
      }
    }
    
    // システムメトリクス更新
    this.metrics.system.totalRequests++;
    this.metrics.system.imageRequests++;
    
    return userMetrics;
  }
  
  // 音声リクエスト追跡
  async trackAudioRequest(userId) {
    // ユーザーメトリクスを取得（データベースかファイルシステムから）
    const userMetrics = await this.getUserMetrics(userId);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    // 日付が変わった場合、audioRequestsTodayをリセット
    if (userMetrics.lastAudioRequestDate === null || 
        new Date(userMetrics.lastAudioRequestDate).getDate() !== now.getDate() ||
        new Date(userMetrics.lastAudioRequestDate).getMonth() !== now.getMonth() ||
        new Date(userMetrics.lastAudioRequestDate).getFullYear() !== now.getFullYear()) {
      userMetrics.audioRequestsToday = 0;
      userMetrics.lastConversationTimestamp = null;
    }
    
    // 「ユーザー→AI→ユーザー」を1回とするカウント方法
    // 前回の音声リクエストから5分以内のリクエストは同じ会話として扱い、カウントしない
    const isNewConversation = !userMetrics.lastConversationTimestamp || 
                             (now.getTime() - userMetrics.lastConversationTimestamp) > (5 * 60 * 1000);
    
    // 継続的な会話の場合はカウントせず、新しい会話のみカウント
    if (isNewConversation) {
      // 今日の音声リクエスト回数を増加
      userMetrics.audioRequestsToday++;
      userMetrics.audioRequests++;
      console.log(`新しい音声会話を開始: ユーザー=${userId}, 今日=${userMetrics.audioRequestsToday}回`);
    } else {
      console.log(`継続中の会話: ユーザー=${userId}, 前回のリクエストから${Math.round((now.getTime() - userMetrics.lastConversationTimestamp)/1000)}秒`);
    }
    
    // 最後の会話時間を更新
    userMetrics.lastConversationTimestamp = now.getTime();
    userMetrics.lastAudioRequestDate = now.getTime();
    userMetrics.lastSeen = now.getTime();
    
    // 最近のクエリ保存
    userMetrics.recentQueries.unshift({
      type: 'audio',
      content: '音声メッセージ',
      timestamp: now.getTime()
    });
    if (userMetrics.recentQueries.length > 5) {
      userMetrics.recentQueries.pop();
    }
    
    // システムメトリクス更新（常に更新）
    this.metrics.system.totalRequests++;
    this.metrics.system.audioRequests = (this.metrics.system.audioRequests || 0) + 1;
    
    // 制限チェック
    const isAllowed = this.audioLimits.quotaRemoved || 
                      (userMetrics.audioRequestsToday <= this.audioLimits.userDailyLimit && 
                       this.metrics.system.audioRequests <= this.audioLimits.globalMonthlyLimit);
    
    let message = '';
    let reason = '';
    
    if (!isAllowed) {
      if (userMetrics.audioRequestsToday > this.audioLimits.userDailyLimit) {
        reason = 'user_daily_limit';
        message = `音声会話の利用回数が1日の上限（${this.audioLimits.userDailyLimit}回）に達しました。明日またご利用ください。`;
      } else {
        reason = 'global_monthly_limit';
        message = '現在、音声会話機能の利用が集中しているため、一時的にご利用いただけません。しばらく経ってからお試しください。';
      }
    }
    
    // データベースに保存（非同期で行うが、結果を待たない）
    this.saveUserAudioMetricsToDb(userId, userMetrics).catch(err => {
      console.error(`音声メトリクスのデータベース保存に失敗: ${err.message}`);
    });
    
    return {
      allowed: isAllowed,
      userDailyCount: userMetrics.audioRequestsToday,
      userDailyLimit: this.audioLimits.userDailyLimit,
      globalMonthlyCount: this.metrics.system.audioRequests,
      globalMonthlyLimit: this.audioLimits.globalMonthlyLimit,
      reason: reason,
      message: message,
      isNewConversation: isNewConversation
    };
  }
  
  // 音声メッセージを使用したことのあるユーザーを取得
  async getVoiceMessageUsers() {
    const voiceUsers = [];
    
    // まずデータベースから取得を試みる
    try {
      const dbResults = await db.query(
        'SELECT user_id, audio_requests_total, last_audio_request_date, last_audio_notification_date FROM user_audio_stats WHERE audio_requests_total > 0'
      );
      
      if (dbResults && dbResults.length > 0) {
        for (const row of dbResults) {
          voiceUsers.push({
            userId: row.user_id,
            audioRequests: row.audio_requests_total,
            lastAudioRequestDate: row.last_audio_request_date,
            lastAudioNotificationDate: row.last_audio_notification_date
          });
        }
        console.log(`データベースから${voiceUsers.length}人の音声ユーザーを取得しました`);
      }
    } catch (dbError) {
      console.error('データベースからの音声ユーザー取得エラー:', dbError.message);
    }
    
    // データベースになかった場合は従来のファイルシステムからも取得（移行期間用）
    if (voiceUsers.length === 0) {
      // まず全ユーザーのJSONファイルをスキャン
      if (fs.existsSync(this.dataPath)) {
        const files = fs.readdirSync(this.dataPath);
        
        for (const file of files) {
          if (file.startsWith('user_') && file.endsWith('.json')) {
            try {
              const userId = file.replace('user_', '').replace('.json', '');
              const userData = JSON.parse(fs.readFileSync(path.join(this.dataPath, file), 'utf8'));
              
              // 音声メッセージを使用したことがあるユーザーを確認
              if (userData.audioRequests && userData.audioRequests > 0) {
                voiceUsers.push({
                  userId,
                  audioRequests: userData.audioRequests,
                  lastAudioRequestDate: userData.lastAudioRequestDate,
                  lastAudioNotificationDate: userData.lastAudioNotificationDate
                });
              }
            } catch (error) {
              console.error(`ユーザーデータ読み込みエラー (${file}):`, error.message);
            }
          }
        }
      }
    }
    
    return voiceUsers;
  }
  
  // 音声制限解除通知
  async notifyVoiceMessageUsers(client, messageText = null) {
    if (!this.audioLimits.quotaRemoved) {
      this.audioLimits.quotaRemoved = true;
      this.saveMetrics(); // 設定を保存
    }
    
    const voiceUsers = await this.getVoiceMessageUsers();
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    let notifiedCount = 0;
    
    const defaultMessage = 
      '【お知らせ】\n\n' +
      '音声メッセージ機能の制限が解除されました。今後は利用回数の制限なく、いつでも音声メッセージをご利用いただけます。' +
      'より便利にAdamをご活用ください。';
    
    const notificationText = messageText || defaultMessage;
    
    for (const user of voiceUsers) {
      // 最後の通知から1週間以上経過しているか、まだ通知していない場合のみ通知
      if (!user.lastAudioNotificationDate || user.lastAudioNotificationDate < oneWeekAgo) {
        try {
          await client.pushMessage(user.userId, {
            type: 'text',
            text: notificationText
          });
          
          // 通知日時を更新
          const userMetrics = await this.getUserMetrics(user.userId);
          userMetrics.lastAudioNotificationDate = now;
          
          // データベースに保存
          await this.saveUserAudioMetricsToDb(user.userId, userMetrics);
          
          // 従来のファイルシステム保存も行う（移行期間用）
          this.saveMetrics();
          
          notifiedCount++;
          console.log(`ユーザー(${user.userId})に音声制限解除通知を送信しました`);
          
          // APIレート制限対策として少し間隔を空ける
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`ユーザー(${user.userId})への通知送信エラー:`, error.message);
        }
      }
    }
    
    console.log(`音声制限解除通知: ${notifiedCount}/${voiceUsers.length}人に送信しました`);
    return {
      totalUsers: voiceUsers.length,
      notifiedUsers: notifiedCount
    };
  }
  
  // 総量規制状態を設定
  setAudioQuotaStatus(removed) {
    this.audioLimits.quotaRemoved = removed;
    this.saveMetrics();
    return this.audioLimits.quotaRemoved;
  }
  
  // 総量規制状態を取得
  getAudioQuotaStatus() {
    return this.audioLimits.quotaRemoved;
  }
  
  // 洞察レポート生成
  generateInsightsReport(userId) {
    const userMetrics = this.getUserMetrics(userId);
    const systemMetrics = this.metrics.system;
    
    // 日付フォーマット関数
    const formatDate = (timestamp) => {
      return new Date(timestamp).toLocaleDateString('ja-JP');
    };
    
    // 稼働日数
    const daysSinceFirstUse = Math.max(1, Math.ceil((Date.now() - userMetrics.firstSeen) / (24 * 60 * 60 * 1000)));
    
    // 平均文字数
    const avgLength = userMetrics.textRequests > 0 
      ? Math.round(userMetrics.totalInputLength / userMetrics.textRequests) 
      : 0;
    
    // レポート生成
    let report = `【利用統計】\n\n`;
    
    report += `■ 利用概要\n`;
    report += `・初回利用日: ${formatDate(userMetrics.firstSeen)}\n`;
    report += `・利用日数: ${daysSinceFirstUse}日\n`;
    
    // 総リクエスト数にaudioRequestsを追加
    const totalRequests = userMetrics.textRequests + userMetrics.imageRequests + (userMetrics.audioRequests || 0);
    report += `・総リクエスト: ${totalRequests}回\n`;
    report += `  - テキスト: ${userMetrics.textRequests}回\n`;
    
    if (userMetrics.imageRequests > 0) {
      report += `  - 画像生成: ${userMetrics.imageRequests}回\n`;
    }
    
    if (userMetrics.audioRequests > 0) {
      report += `  - 音声メッセージ: ${userMetrics.audioRequests}回\n`;
    }
    
    report += `・1日平均: ${Math.round(totalRequests / daysSinceFirstUse * 10) / 10}回\n\n`;
    
    if (userMetrics.textRequests > 0) {
      report += `■ テキスト分析\n`;
      report += `・平均文字数: ${avgLength}文字\n`;
      report += `・最長: ${userMetrics.longestInput}文字\n`;
      if (userMetrics.shortestInput < Infinity) {
        report += `・最短: ${userMetrics.shortestInput}文字\n`;
      }
    }
    
    if (userMetrics.recentQueries.length > 0) {
      report += `\n■ 最近のやりとり\n`;
      userMetrics.recentQueries.forEach((query, index) => {
        const date = new Date(query.timestamp);
        const timeStr = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        const typeLabel = query.type === 'image' ? '[画像]' : 
                          query.type === 'audio' ? '[音声]' : '';
        report += `・${timeStr} ${typeLabel} ${query.content}\n`;
      });
    }
    
    report += `\n■ システム情報\n`;
    report += `・サービス全体利用回数: ${systemMetrics.totalRequests}回\n`;
    
    return report;
  }
}

module.exports = new InsightsService(); 