/**
 * トークン削減効果測定シミュレーション
 * 
 * このスクリプトは、画像関連データの保存形式変更によるトークン削減効果を
 * シミュレーションします。
 */

// 画像分析のサンプルデータ
const sampleAnalysis = `この画像には美しい風景が写っています。中央には澄んだ青い湖があり、周囲には緑豊かな森林と山々が広がっています。空は青く、わずかな雲が浮かんでいます。湖の手前には小さな桟橋があり、ボートが停泊しています。遠くには雪をかぶった山脈が見え、全体的に穏やかで平和な雰囲気です。湖面は風がなく、山々が鏡のように反射しています。前景には、いくつかの岩と低い草木があります。光の加減で湖面が輝いており、おそらく早朝か夕方に撮影されたものと思われます。この写真は高解像度で撮影されており、細部まで鮮明に写っています。`;

// 画像URL例
const sampleImageUrl = 'https://example.com/generated-images/landscape-1234567890abcdef1234567890abcdef.jpg';

// 画像説明テキストのサンプル
const sampleDescription = '自然風景と心の安らぎの関係性について説明した図表。自然環境がもたらすストレス軽減効果と精神的健康への影響を視覚的に表現しています。森林や水辺の風景が人間の脳にどのような変化をもたらすかを科学的データに基づいて解説しています。';

// 旧形式のストレージ形式
function oldStorageFormat() {
  return {
    imageAnalysis: `[画像分析] ${sampleAnalysis}`,
    imageGeneration: `[生成画像] ${sampleDescription}`
  };
}

// 新形式のストレージ形式（参照形式）
function newStorageFormat() {
  const messageId = '1234567890';
  const analysisPreview = sampleAnalysis.substring(0, 30) + (sampleAnalysis.length > 30 ? '...' : '');
  const urlPreview = sampleImageUrl.substring(0, 20) + '...';
  const textPreview = sampleDescription.substring(0, 30) + (sampleDescription.length > 30 ? '...' : '');
  
  return {
    imageAnalysis: `[画像分析参照] ID:${messageId} - ${analysisPreview}`,
    imageGeneration: `[生成画像参照] URL:${urlPreview} - ${textPreview}`
  };
}

// トークン数の概算（単純化のため1文字=1トークンとして計算）
function estimateTokens(text) {
  return text.length;
}

// 削減効果の計算と表示
function calculateReduction() {
  const old = oldStorageFormat();
  const new_ = newStorageFormat();
  
  const oldAnalysisTokens = estimateTokens(old.imageAnalysis);
  const newAnalysisTokens = estimateTokens(new_.imageAnalysis);
  const analysisReduction = oldAnalysisTokens - newAnalysisTokens;
  const analysisReductionPercent = (analysisReduction / oldAnalysisTokens * 100).toFixed(2);
  
  const oldGenerationTokens = estimateTokens(old.imageGeneration);
  const newGenerationTokens = estimateTokens(new_.imageGeneration);
  const generationReduction = oldGenerationTokens - newGenerationTokens;
  const generationReductionPercent = (generationReduction / oldGenerationTokens * 100).toFixed(2);
  
  const totalOldTokens = oldAnalysisTokens + oldGenerationTokens;
  const totalNewTokens = newAnalysisTokens + newGenerationTokens;
  const totalReduction = totalOldTokens - totalNewTokens;
  const totalReductionPercent = (totalReduction / totalOldTokens * 100).toFixed(2);
  
  console.log('===== トークン削減効果シミュレーション =====');
  console.log('\n【画像分析データ】');
  console.log('旧形式:', old.imageAnalysis);
  console.log('新形式:', new_.imageAnalysis);
  console.log(`トークン削減: ${oldAnalysisTokens} → ${newAnalysisTokens} (${analysisReduction}トークン削減, ${analysisReductionPercent}%削減)`);
  
  console.log('\n【画像生成データ】');
  console.log('旧形式:', old.imageGeneration);
  console.log('新形式:', new_.imageGeneration);
  console.log(`トークン削減: ${oldGenerationTokens} → ${newGenerationTokens} (${generationReduction}トークン削減, ${generationReductionPercent}%削減)`);
  
  console.log('\n【総合効果】');
  console.log(`総トークン削減: ${totalOldTokens} → ${totalNewTokens} (${totalReduction}トークン削減, ${totalReductionPercent}%削減)`);
  
  // 実際のユースケースの効果推定
  const averageConversations = 100;
  const averageImagesPerConversation = 3;
  const totalTokenReductionEstimate = totalReduction * averageImagesPerConversation * averageConversations;
  
  console.log('\n【実用的な効果推定】');
  console.log(`想定: ${averageConversations}会話 × 平均${averageImagesPerConversation}画像/会話`);
  console.log(`推定トークン削減総数: 約${totalTokenReductionEstimate.toLocaleString()}トークン`);
  console.log('※これは概算であり、実際のOpenAIトークンカウントとは異なる場合があります');
}

// シミュレーションを実行
calculateReduction(); 