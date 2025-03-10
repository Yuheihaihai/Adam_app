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
  },
  {
    id: "dcareer",
    name: "ディーキャリア",
    url: "https://dd-career.com/",
    description: "発達障害のある方の「働く」をサポートする就労移行支援事業所。一般枠就労も支援。",
    criteria: {
      employment: {
        seeking_job: true,
        general_employment_interest: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["neurodivergent", "employment", "training", "general_employment"],
    cooldown_days: 14
  },
  {
    id: "litalico",
    name: "LITALICO ワークス",
    url: "https://works.litalico.jp/",
    description: "障害の有無に関わらず、一人ひとりの「働きたい」を実現するための就労支援サービス",
    criteria: {
      employment: {
        seeking_job: true,
        general_employment_interest: true
      },
      education: {
        skill_development: true
      }
    },
    tags: ["neurodivergent", "employment", "training", "general_employment"],
    cooldown_days: 14
  },
  {
    id: "kaien",
    name: "Kaien（カイエン）",
    url: "https://www.kaien-lab.com/",
    description: "発達障害のある方のためのIT・事務職に特化した就労支援サービス",
    criteria: {
      employment: {
        seeking_job: true
      },
      interests: {
        technology: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["neurodivergent", "employment", "IT", "training"],
    cooldown_days: 14
  },
  {
    id: "newstart",
    name: "ニュースタート",
    url: "https://www.newstart-jimu.com/",
    description: "引きこもり状態の方へのレンタルお姉さん・お兄さんによる訪問支援サービス",
    criteria: {
      social: {
        is_hikikomori: true,
        isolation: true
      }
    },
    tags: ["hikikomori", "visitation", "support", "social"],
    cooldown_days: 21
  },
  {
    id: "welbe",
    name: "ウェルビー",
    url: "https://www.welbe.co.jp/",
    description: "発達障害に特化した就労移行支援。IT・事務職向けプログラムと一般枠就労支援も提供",
    criteria: {
      employment: {
        seeking_job: true,
        general_employment_interest: true
      },
      interests: {
        technology: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["neurodivergent", "employment", "IT", "general_employment"],
    cooldown_days: 14
  },
  {
    id: "atgp",
    name: "アットジーピー",
    url: "https://www.atgp.jp/",
    description: "発達障害のある方の就労支援と企業向けコンサルティングを行うサービス",
    criteria: {
      employment: {
        seeking_job: true,
        career_transition: true,
        general_employment_interest: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["neurodivergent", "employment", "consulting", "general_employment"],
    cooldown_days: 14
  },
  {
    id: "autism_society",
    name: "日本自閉症協会",
    url: "https://www.autism.or.jp/",
    description: "自閉症に関する情報提供や支援を行う全国組織",
    criteria: {
      mental_health: {
        seeking_therapy: true,
        neurodivergent_traits: true
      },
      social: {
        seeking_community: true
      }
    },
    tags: ["autism", "support", "community", "information"],
    cooldown_days: 30
  },
  {
    id: "ddac",
    name: "発達障害情報・支援センター",
    url: "https://www.rehab.go.jp/ddis/",
    description: "発達障害に関する情報提供や支援を行う国の機関",
    criteria: {
      mental_health: {
        seeking_therapy: true,
        neurodivergent_traits: true
      },
      education: {
        seeking_education: true
      }
    },
    tags: ["neurodivergent", "information", "support", "government"],
    cooldown_days: 30
  },
  {
    id: "specialisterne",
    name: "スペシャリステルネ・ジャパン",
    url: "https://specialisterne.jp/",
    description: "自閉症スペクトラムなどの特性を持つ方のIT分野での一般就労を支援",
    criteria: {
      employment: {
        seeking_job: true,
        general_employment_interest: true
      },
      interests: {
        technology: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["neurodivergent", "IT", "general_employment", "autism"],
    cooldown_days: 14
  },
  {
    id: "mirairo",
    name: "ミライロ",
    url: "https://www.mirairo.co.jp/",
    description: "障害のある方の就労支援とバリアフリー社会の実現を目指す企業",
    criteria: {
      employment: {
        seeking_job: true,
        general_employment_interest: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["disability", "employment", "general_employment", "consulting"],
    cooldown_days: 14
  },
  {
    id: "pasona_heartful",
    name: "パソナハートフル",
    url: "https://www.pasona-heartful.co.jp/",
    description: "障害のある方の就労支援と企業の障害者雇用をサポート",
    criteria: {
      employment: {
        seeking_job: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["disability", "employment", "support", "training"],
    cooldown_days: 14
  },
  {
    id: "compass",
    name: "COMPASS（コンパス）",
    url: "https://www.compass-jpn.com/",
    description: "発達障害のあるお子さまの療育と教育支援サービス",
    criteria: {
      education: {
        seeking_education: true,
        learning_difficulties: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["neurodivergent", "education", "therapy", "children"],
    cooldown_days: 30
  },
  {
    id: "litalico_junior",
    name: "LITALICO ジュニア",
    url: "https://junior.litalico.jp/",
    description: "発達障害のあるお子さまの学習支援と療育サービス",
    criteria: {
      education: {
        seeking_education: true,
        learning_difficulties: true
      },
      mental_health: {
        neurodivergent_traits: true
      }
    },
    tags: ["neurodivergent", "education", "therapy", "children"],
    cooldown_days: 30
  }
  // Add more services as needed
]; 