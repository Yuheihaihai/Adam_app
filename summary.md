# サービス推奨システム改善の概要

## 現状の問題点

1. **不適切なタイミングでのサービス表示**
   - ユーザーがアドバイスを明示的に求めていない場合でもサービスが表示されている
   - 「一回広告をだしたらCooldownしましょう」というご要望がある

2. **クールダウン期間の不遵守**
   - サービスごとに設定されているクールダウン期間（cooldown_days）が適切に守られていない
   - 短期間に同じサービスが繰り返し表示されている

## 解決策

### 1. 明示的なアドバイス要求の厳格化

`shouldShowServicesToday` 関数を修正して、ユーザーが明示的にアドバイスを求めた場合のみサービスを表示するようにします：

```javascript
// 明示的なアドバイス要求パターン
const explicitAdvicePatterns = [
  'アドバイスください', 'アドバイス下さい', 'アドバイスをください',
  'アドバイスが欲しい', 'アドバイスをお願い', '助言ください',
  'おすすめを教えて', 'サービスを教えて', 'サービスある',

];

// 明示的なアドバイス要求かどうかをチェック
const isExplicitRequest = userMessage && explicitAdvicePatterns.some(pattern => userMessage.includes(pattern));

// 明示的なアドバイス要求でない場合、サービスを表示しない
if (!isExplicitRequest) {
  console.log('Not showing services: No explicit advice request detected');
  return false;
}
```

### 2. サービス固有のクールダウン期間の尊重

各サービスの `cooldown_days` 設定を尊重し、その期間内は同じサービスを再表示しないようにします：

```javascript
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
```

### 3. サービス推奨の表示条件の改善

サービス推奨を表示するかどうかの決定ロジックを改善します：

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

## 期待される効果

1. **ユーザー体験の向上**
   - ユーザーが明示的にアドバイスを求めた場合のみサービスが表示されるため、不要な広告表示が減少
   - サービスのクールダウン期間が適切に守られるため、同じサービスが短期間に繰り返し表示されることがなくなる

2. **サービス推奨の効果向上**
   - 適切なタイミングでサービスが表示されるため、ユーザーがサービスに興味を持つ可能性が高まる
   - サービスごとに適切なクールダウン期間が設定されるため、ユーザーが検討する時間を確保できる

3. **システムの透明性向上**
   - ログメッセージが強化されるため、サービス推奨の表示/非表示の理由が明確になる
   - デバッグが容易になり、システムの動作を理解しやすくなる

## 実装手順

詳細な実装手順については、以下のドキュメントを参照してください：

1. [サービス推奨システム改善パッチ](service_recommendations_patch.md) - 改善案の概要
2. [サービスのクールダウン期間に関する推奨事項](service_cooldown_recommendations.md) - クールダウン期間の推奨設定
3. [サービス推奨システム改善実装ガイド](implementation_guide.md) - 詳細な実装手順 