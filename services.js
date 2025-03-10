// services.js - Service registry for external services
module.exports = [
  {
    id: "comoly",
    name: "COMOLY",
    url: "https://comoly.jp",
    description: "ひきこもり経験者向けの在宅ワークやコミュニティを提供しているサービス",
    criteria: {
      employment: {
        has_training: false,
        has_income: false
      },
      social: {
        is_hikikomori: true
      }
    },
    tags: ["hikikomori", "remote_work", "community", "employment"],
    cooldown_days: 14
  }
  // Add more services as needed
]; 