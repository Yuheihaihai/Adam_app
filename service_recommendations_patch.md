# サービス推奨システム改善パッチ

## 問題点

1. **不要なサービス推奨**: ユーザーがアドバイスを明示的に求めていない場合でもサービスが表示されている
2. **クールダウン期間**: サービスごとに設定されているクールダウン期間（cooldown_days）が適切に守られていない

## 改善案

### 1. `shouldShowServicesToday` 関数の改善

`server.js` ファイルの `shouldShowServicesToday` 関数を以下のように修正してください：

```javascript
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

### 2. `detectAdviceRequest` 関数の改善（オプション）

より高度なアドバイス要求検出のために、`adviceDetector.js` モジュールを使用することも検討してください。これにより、より正確にユーザーのアドバイス要求を検出できます。

### 3. サービス推奨の表示条件の改善

`server.js` ファイルで、サービス推奨を表示するかどうかの決定ロジックを改善してください：

```javascript
// サービス推奨を表示するかどうかの決定
const shouldShow = isExplicitAdviceRequest && 
                  shouldShowServicesToday(userId, history, userMessage) && 
                  isAppropriateTimeForServices(history, userMessage);
```

### 4. サービスのクールダウン期間の確認

`services.js` ファイルで、各サービスの `cooldown_days` 設定を確認し、適切な値に設定してください。例えば：

- 一般的なサービス: 14日（2週間）
- 緊急サービス: 7日（1週間）
- 情報提供サービス: 30日（1ヶ月）

## 実装手順

1. `server.js` ファイルの `shouldShowServicesToday` 関数を上記のコードに置き換える
2. サービス推奨の表示条件のロジックを確認し、必要に応じて修正する
3. `services.js` ファイルの各サービスの `cooldown_days` 設定を確認する
4. 変更をテストして、サービス推奨が適切なタイミングでのみ表示されることを確認する 