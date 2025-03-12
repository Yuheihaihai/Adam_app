# サービス推奨システム改善実装ガイド

このガイドでは、サービス推奨システムを改善するための具体的な実装手順を説明します。

## 1. `shouldShowServicesToday` 関数の修正

`server.js` ファイルの `shouldShowServicesToday` 関数を以下のように修正します：

```javascript
/**
 * ユーザーにサービス推奨を表示すべきかどうかを判断する
 * @param {string} userId - ユーザーID
 * @param {Array} history - 会話履歴
 * @param {string} userMessage - ユーザーメッセージ
 * @returns {boolean} - サービス推奨を表示すべきかどうか
 */
function shouldShowServicesToday(userId, history, userMessage) {
  // 明示的なアドバイス要求パターン
  const explicitAdvicePatterns = [
    'アドバイスください', 'アドバイス下さい', 'アドバイスをください',
    'アドバイスが欲しい', 'アドバイスをお願い', '助言ください',
    'おすすめを教えて', 'サービスを教えて', 'サービスある'
  ];
  
  // 明示的なアドバイス要求かどうかをチェック
  const isExplicitRequest = userMessage && explicitAdvicePatterns.some(pattern => userMessage.includes(pattern));
  
  // 明示的なアドバイス要求でない場合、サービスを表示しない
  if (!isExplicitRequest) {
    console.log('Not showing services: No explicit advice request detected');
    return false;
  }
  
  console.log('Explicit advice request detected');
  
  try {
    // ユーザー設定を取得
    const userPrefs = userPreferences.getUserPreferences(userId);
    const lastServiceTime = userPrefs.lastServiceTime || 0;
    const now = Date.now();
    
    // 以前表示したサービスを取得してクールダウン期間をチェック
    const lastShownServices = userPrefs.recentlyShownServices || {};
    
    // 以前表示したサービスがまだクールダウン期間中かどうかをチェック
    for (const timestamp in lastShownServices) {
      const services = lastShownServices[timestamp];
      const daysSinceShown = (now - parseInt(timestamp)) / (24 * 60 * 60 * 1000);
      
      // 各サービスのクールダウン期間をservices.jsから取得してチェック
      for (const serviceId of services) {
        // services.jsからサービスデータを検索
        const serviceData = servicesData.find(s => s.id === serviceId);
        if (serviceData && serviceData.cooldown_days) {
          // まだクールダウン期間中の場合、サービスを表示しない
          if (daysSinceShown < serviceData.cooldown_days) {
            console.log(`Not showing services: Service ${serviceId} still in cooldown period (${daysSinceShown.toFixed(1)} days of ${serviceData.cooldown_days} days)`);
            return false;
          }
        }
      }
    }
    
    // 最近サービス推奨を受け取った場合（過去4時間以内）
    if (lastServiceTime > 0 && now - lastServiceTime < 4 * 60 * 60 * 1000) {
      // 今日の合計サービス推奨数をカウント
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      let servicesToday = 0;
      if (userPrefs.recentlyShownServices) {
        for (const timestamp in userPrefs.recentlyShownServices) {
          if (parseInt(timestamp) > todayStart.getTime()) {
            servicesToday += userPrefs.recentlyShownServices[timestamp].length;
          }
        }
      }
      
      // 1日あたり最大9件のサービス推奨に制限
      if (servicesToday >= 9) {
        console.log('Not showing services: Daily limit reached (9 recommendations)');
        return false;
      }
      
      // 今日のサービス推奨が5件未満の場合、より長い最小間隔を要求
      if (servicesToday < 5 && now - lastServiceTime < 45 * 60 * 1000) {
        console.log('Not showing services: Minimum time gap not reached (45 minutes)');
        return false; // 最後の推奨から45分未満
      }
      
      // 一般的なルール：30分に1回以上推奨しない
      if (now - lastServiceTime < 30 * 60 * 1000) {
        console.log('Not showing services: Minimum time gap not reached (30 minutes)');
        return false;
      }
    }
    
    // すべてのチェックに合格した場合、推奨を許可
    console.log('Showing services: All conditions met for explicit advice request');
    return true;
  } catch (err) {
    console.error('Error in shouldShowServicesToday:', err);
    return false; // エラーがある場合はデフォルトで表示しない（より安全）
  }
}
```

## 2. サービス推奨の表示条件の改善

`server.js` ファイルで、サービス推奨を表示するかどうかの決定ロジックを確認し、必要に応じて修正します。以下のようなコードを探して修正してください：

```javascript
// 修正前
const shouldShow = isExplicitAdviceRequest || 
                  (shouldShowServicesToday(userId, history, userMessage) && 
                   isAppropriateTimeForServices(history, userMessage) &&
                   isAskingForAdvice);

// 修正後
const shouldShow = isExplicitAdviceRequest && 
                  shouldShowServicesToday(userId, history, userMessage) && 
                  isAppropriateTimeForServices(history, userMessage);
```

## 3. サービス推奨の追跡と保存の改善

サービス推奨が表示された後、その情報を適切に保存するコードを確認し、必要に応じて修正します：

```javascript
// サービス推奨を表示した後の処理
if (serviceRecommendations && serviceRecommendations.length > 0) {
  // ユーザー設定を取得
  const userPrefs = userPreferences.getUserPreferences(userId);
  
  // 現在の時刻を取得
  const now = Date.now();
  
  // 最後にサービスを表示した時刻を更新
  userPrefs.lastServiceTime = now;
  
  // 表示したサービスを記録
  if (!userPrefs.recentlyShownServices) {
    userPrefs.recentlyShownServices = {};
  }
  
  // サービスIDのリストを作成
  const serviceIds = serviceRecommendations.map(service => 
    typeof service === 'string' ? service : service.id || service.serviceName
  );
  
  // 表示したサービスを記録
  userPrefs.recentlyShownServices[now] = serviceIds;
  
  // ユーザー設定を更新
  userPreferences.updateUserPreferences(userId, userPrefs);
  
  console.log(`Updated user preferences with ${serviceIds.length} shown services`);
}
```

## 4. テスト手順

実装後、以下のテストを行って機能が正しく動作することを確認してください：

1. **明示的なアドバイス要求テスト**:
   - 「アドバイスください」などの明示的な要求を含むメッセージを送信
   - サービス推奨が表示されることを確認

2. **非アドバイス要求テスト**:
   - 通常の会話メッセージを送信
   - サービス推奨が表示されないことを確認

3. **クールダウン期間テスト**:
   - 明示的なアドバイス要求を送信してサービス推奨を表示
   - 短時間内に再度明示的なアドバイス要求を送信
   - サービス推奨が表示されないことを確認（時間制限による）
   - 十分な時間が経過した後に再度明示的なアドバイス要求を送信
   - サービス推奨が表示されることを確認

4. **サービス固有のクールダウンテスト**:
   - ログを確認して、サービス固有のクールダウン期間が守られていることを確認

## 5. ログの確認方法

実装後、以下のログメッセージを確認して機能が正しく動作していることを確認できます：

- `Explicit advice request detected` - 明示的なアドバイス要求が検出された
- `Not showing services: No explicit advice request detected` - 明示的なアドバイス要求がないため表示しない
- `Not showing services: Service X still in cooldown period` - サービスXがまだクールダウン期間中
- `Not showing services: Daily limit reached` - 1日の制限に達した
- `Not showing services: Minimum time gap not reached` - 最小時間間隔に達していない
- `Showing services: All conditions met for explicit advice request` - すべての条件を満たし、サービスを表示する

これらのログメッセージを確認することで、サービス推奨システムが期待通りに動作しているかどうかを確認できます。 