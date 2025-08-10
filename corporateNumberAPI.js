// corporateNumberAPI.js - 国税庁法人番号システムAPI連携モジュール
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

/**
 * 国税庁法人番号システムAPI連携クラス
 * 法人番号による企業情報検索と重複判定機能を提供
 */
class CorporateNumberAPI {
  constructor() {
    this.baseUrl = 'https://api.houjin-bangou.nta.go.jp';
    this.apiVersion = '4'; // 最新版
    this.applicationId = process.env.CORPORATE_NUMBER_API_ID; // アプリケーションID
    this.timeout = 10000; // 10秒タイムアウト
    this.cache = new Map(); // 検索結果キャッシュ
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24時間キャッシュ
    
    if (!this.applicationId) {
      console.warn('[CorporateNumberAPI] CORPORATE_NUMBER_API_ID not set. API功能は無効です。');
      console.warn('[CorporateNumberAPI] 国税庁からアプリケーションIDを取得してください: https://www.houjin-bangou.nta.go.jp/pc/webapi/index.html');
    }
  }

  /**
   * 法人名から法人番号を検索
   * @param {string} companyName - 法人名
   * @param {string} websiteUrl - ウェブサイトURL（照合用）
   * @returns {Promise<string|null>} - 法人番号（13桁）またはnull
   */
  async searchCorporateNumber(companyName, websiteUrl = null) {
    // アプリケーションIDが設定されていない場合は無効
    if (!this.applicationId) {
      console.log('[CorporateNumberAPI] API disabled - no application ID set');
      return null;
    }

    if (!companyName || typeof companyName !== 'string') {
      console.warn('[CorporateNumberAPI] Invalid company name provided');
      return null;
    }

    const cacheKey = `search_${this._sanitizeForCache(companyName)}`;
    
    // キャッシュチェック
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        console.log(`[CorporateNumberAPI] Using cached result for: ${companyName}`);
        return cached.corporateNumber;
      }
    }

    try {
      console.log(`[CorporateNumberAPI] Searching corporate number for: ${companyName}`);
      
      // 会社名を正規化（株式会社、合同会社等の表記統一）
      const normalizedName = this._normalizeCompanyName(companyName);
      
      // 複数パターンで検索
      const searchPatterns = [
        normalizedName,
        companyName,
        this._extractCoreCompanyName(companyName)
      ].filter(Boolean);

      for (const pattern of searchPatterns) {
        const result = await this._searchByPattern(pattern, websiteUrl);
        if (result) {
          // キャッシュに保存
          this.cache.set(cacheKey, {
            corporateNumber: result,
            timestamp: Date.now()
          });
          console.log(`[CorporateNumberAPI] Found corporate number: ${result} for ${companyName}`);
          return result;
        }
      }

      console.log(`[CorporateNumberAPI] No corporate number found for: ${companyName}`);
      
      // 見つからない場合もキャッシュ（短期間）
      this.cache.set(cacheKey, {
        corporateNumber: null,
        timestamp: Date.now()
      });
      
      return null;
    } catch (error) {
      console.error(`[CorporateNumberAPI] Error searching corporate number for ${companyName}:`, error.message);
      return null;
    }
  }

  /**
   * パターンによる検索実行
   * @private
   */
  async _searchByPattern(searchPattern, websiteUrl) {
    try {
      const encodedPattern = encodeURIComponent(searchPattern);
      // 正しい国税庁法人番号システムAPI URL
      const apiUrl = `${this.baseUrl}/${this.apiVersion}/name?id=${this.applicationId}&name=${encodedPattern}&type=12&history=0`;
      
      const response = await axios.get(apiUrl, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Adam-AI-Service-Discovery/2.4'
        }
      });

      // レスポンスはXMLまたはCSV形式
      const data = response.data;
      if (!data || typeof data !== 'string') {
        return null;
      }

      // XMLレスポンスの解析（簡易版）
      const corporations = this._parseXMLResponse(data);
      
      if (corporations.length === 0) {
        return null;
      }

      // 完全一致を優先
      const exactMatch = corporations.find(corp => 
        this._isExactNameMatch(corp.name, searchPattern)
      );
      
      if (exactMatch) {
        return exactMatch.corporateNumber;
      }

      // ウェブサイトURLでの照合
      if (websiteUrl) {
        const urlMatch = corporations.find(corp => 
          corp.website && this._isDomainMatch(corp.website, websiteUrl)
        );
        
        if (urlMatch) {
          return urlMatch.corporateNumber;
        }
      }

      // 部分一致（最も類似度の高いもの）
      const bestMatch = this._findBestMatch(corporations, searchPattern);
      return bestMatch ? bestMatch.corporateNumber : null;

    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.warn(`[CorporateNumberAPI] Request timeout for pattern: ${searchPattern}`);
      } else {
        console.warn(`[CorporateNumberAPI] API error for pattern ${searchPattern}:`, error.message);
      }
      return null;
    }
  }

  /**
   * 法人番号による詳細情報取得
   * @param {string} corporateNumber - 法人番号（13桁）
   * @returns {Promise<Object|null>} - 法人詳細情報
   */
  async getCorporateDetails(corporateNumber) {
    if (!this.applicationId) {
      console.log('[CorporateNumberAPI] API disabled - no application ID set');
      return null;
    }

    if (!this._isValidCorporateNumber(corporateNumber)) {
      console.warn('[CorporateNumberAPI] Invalid corporate number format');
      return null;
    }

    const cacheKey = `details_${corporateNumber}`;
    
    // キャッシュチェック
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.details;
      }
    }

    try {
      const apiUrl = `${this.baseUrl}/${this.apiVersion}/num?id=${this.applicationId}&number=${corporateNumber}&type=12&history=0`;
      
      const response = await axios.get(apiUrl, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Adam-AI-Service-Discovery/2.4'
        }
      });

      const data = response.data;
      if (!data || typeof data !== 'string') {
        return null;
      }

      // XMLレスポンスの解析
      const details = this._parseXMLResponse(data)[0] || null;
      
      // キャッシュに保存
      this.cache.set(cacheKey, {
        details,
        timestamp: Date.now()
      });

      return details;
    } catch (error) {
      console.error(`[CorporateNumberAPI] Error fetching details for ${corporateNumber}:`, error.message);
      return null;
    }
  }

  /**
   * 会社名正規化
   * @private
   */
  _normalizeCompanyName(name) {
    return name
      .replace(/株式会社/g, '(株)')
      .replace(/合同会社/g, '(合)')
      .replace(/一般社団法人/g, '(一社)')
      .replace(/特定非営利活動法人/g, '(NPO)')
      .replace(/\s+/g, '')
      .trim();
  }

  /**
   * 会社名のコア部分抽出
   * @private
   */
  _extractCoreCompanyName(name) {
    return name
      .replace(/(株式会社|合同会社|一般社団法人|特定非営利活動法人|NPO法人)/g, '')
      .replace(/[（）()]/g, '')
      .trim();
  }

  /**
   * 完全名前一致判定
   * @private
   */
  _isExactNameMatch(apiName, searchName) {
    const normalize = (str) => str.replace(/[（）()\s]/g, '').toLowerCase();
    return normalize(apiName) === normalize(searchName);
  }

  /**
   * ドメイン一致判定
   * @private
   */
  _isDomainMatch(apiWebsite, candidateUrl) {
    try {
      const apiDomain = new URL(apiWebsite).hostname.replace(/^www\./, '').toLowerCase();
      const candidateDomain = new URL(candidateUrl).hostname.replace(/^www\./, '').toLowerCase();
      return apiDomain === candidateDomain;
    } catch (error) {
      return false;
    }
  }

  /**
   * 最適マッチ検索
   * @private
   */
  _findBestMatch(corporations, searchPattern) {
    const searchLower = searchPattern.toLowerCase();
    
    // スコアリング
    const scored = corporations.map(corp => {
      const nameLower = corp.name.toLowerCase();
      let score = 0;
      
      // 完全一致ボーナス
      if (nameLower === searchLower) score += 100;
      
      // 前方一致ボーナス
      if (nameLower.startsWith(searchLower)) score += 50;
      
      // 後方一致ボーナス
      if (nameLower.endsWith(searchLower)) score += 30;
      
      // 部分一致ボーナス
      if (nameLower.includes(searchLower)) score += 20;
      
      // 長さ差ペナルティ
      const lengthDiff = Math.abs(nameLower.length - searchLower.length);
      score -= lengthDiff * 2;
      
      return { corp, score };
    });

    // 最高スコアを選択（最低スコア10以上）
    const best = scored
      .filter(item => item.score >= 10)
      .sort((a, b) => b.score - a.score)[0];

    return best ? best.corp : null;
  }

  /**
   * 法人番号形式検証
   * @private
   */
  _isValidCorporateNumber(number) {
    return /^\d{13}$/.test(number);
  }

  /**
   * XMLレスポンス解析（簡易版）
   * @private
   */
  _parseXMLResponse(xmlData) {
    const corporations = [];
    
    try {
      // 簡易的なXML解析（正規表現ベース）
      const corporationMatches = xmlData.match(/<corporation[^>]*>.*?<\/corporation>/gs) || [];
      
      for (const match of corporationMatches) {
        const corp = {};
        
        // 法人番号
        const numberMatch = match.match(/<corporateNumber>([^<]+)<\/corporateNumber>/);
        if (numberMatch) corp.corporateNumber = numberMatch[1];
        
        // 法人名
        const nameMatch = match.match(/<name>([^<]+)<\/name>/);
        if (nameMatch) corp.name = nameMatch[1];
        
        // 所在地
        const locationMatch = match.match(/<location>([^<]+)<\/location>/);
        if (locationMatch) corp.location = locationMatch[1];
        
        // 法人番号があるもののみ追加
        if (corp.corporateNumber) {
          corporations.push(corp);
        }
      }
    } catch (error) {
      console.warn('[CorporateNumberAPI] XML parsing error:', error.message);
    }
    
    return corporations;
  }

  /**
   * キャッシュキー用文字列サニタイズ
   * @private
   */
  _sanitizeForCache(str) {
    return str.replace(/[^a-zA-Z0-9ぁ-んァ-ヶ一-龯]/g, '_').substring(0, 50);
  }

  /**
   * キャッシュクリア
   */
  clearCache() {
    this.cache.clear();
    console.log('[CorporateNumberAPI] Cache cleared');
  }

  /**
   * キャッシュ統計取得
   */
  getCacheStats() {
    const total = this.cache.size;
    const expired = Array.from(this.cache.values())
      .filter(item => Date.now() - item.timestamp >= this.cacheTTL).length;
    
    return {
      total,
      active: total - expired,
      expired
    };
  }
}

module.exports = CorporateNumberAPI;
