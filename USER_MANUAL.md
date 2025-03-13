# ADam App User Manual

## Service Recommendation System

### Overview

ADam App is designed to understand user needs through natural conversation and provide relevant service recommendations based on those needs. The system analyzes conversations to identify various needs related to employment, mental health, social connections, and more.

### Key Features

#### 1. Intelligent Service Matching

The app automatically identifies user needs from conversations and matches them with appropriate services. Key categories include:

- **Mental Health Support**: Services for depression, anxiety, stress management
- **Career Services**: Job hunting, work transitions, training opportunities
- **Social Support**: Community connections, isolation help, social interaction
- **Financial Assistance**: Financial support, benefits information
- **Daily Living Support**: Housing, healthcare access, and other daily needs

#### 2. User Preference Controls

Users have complete control over what service recommendations they receive:

| Command | Description | Example |
|---------|-------------|---------|
| サービス表示オフ | Turn off all service recommendations | "サービス表示オフ" |
| サービス表示オン | Turn on service recommendations | "サービス表示オン" |
| サービスオフ | Turn off all service recommendations (shorthand) | "サービスオフ" |
| サービスオン | Turn on service recommendations (shorthand) | "サービスオン" |
| サービス数[数字] | Set the number of services displayed | "サービス数2" (Show 2 services) |
| 信頼度[数字] | Set minimum confidence level (0-100) | "信頼度80" (80% confidence) |
| サービス設定確認 | Check current settings | "サービス設定確認" |

#### 3. Contextual Understanding

The system intelligently responds to user feedback about services:

- If a user says "お仕事関係ない" (not related to work), the system will avoid showing employment services
- When mentioning "メンタル" (mental), the system prioritizes mental health services
- For users in distress, a minimal service display format is used
- The system adapts to negative feedback about specific service categories

#### 4. Natural Language Interaction

The app understands various ways users might express preferences:

- Direct statements: "仕事関係ない" (not related to work)
- Inquiries: "メンタルについて知りたい" (want to know about mental health)
- Feedback: "就職サービスはいらない" (don't need employment services)

### Example Interactions

#### Example 1: Mental Health Concerns

**User**: "メンタルやばい" (My mental health is terrible)  
**System Response**: 
- Sympathetic message about mental health
- Recommendations for mental health services like counseling hotlines

#### Example 2: Rejecting Career Services

**User**: "お仕事関係ない" (This has nothing to do with work)  
**System Response**:
- Acknowledges the user's feedback
- Prioritizes other categories like mental health or social support
- Avoids showing career-related services

#### Example 3: Adjusting Settings

**User**: "サービス数1" (Show just 1 service)  
**System Response**:
- Confirms the setting change
- In future responses, shows only 1 service recommendation

### Tips for Best Experience

1. **Be specific about needs**: The more clearly you express your situation, the better the service matches
2. **Provide feedback**: If recommendations aren't helpful, let the system know
3. **Try different phrases**: If your needs change, use different key phrases to get better matches
4. **Adjust settings**: Use the commands above to customize your experience

### Privacy and Data Protection

- All conversations are processed securely
- Personal information is protected according to applicable privacy laws
- Service recommendations are based on conversation analysis, not personal profiles

### X (Former Twitter) Sharing Feature

When you provide positive feedback about Adam, you can use the app's sharing feature.

**Feature Characteristics:**
- Automatically displays X sharing link when users show high satisfaction with Adam or the service
- Detects specific positive feedback beyond simple "thank you" messages
- AI understands context and suggests sharing only at appropriate moments
- Enhanced with LLM technology for more accurate context understanding
- Two-step verification process ensures sharing suggestions are relevant and timely

**How to Use:**
1. Send specific positive feedback during your conversation with Adam (e.g., "Adam, you've been really helpful!")
2. When the sharing link appears, click it to share on X (formerly Twitter)
3. If you don't wish to share, simply continue the conversation as normal and the sharing feature will automatically hide

**Examples:**
- "Adam, your advice has been very helpful"
- "This AI counselor is really convenient"
- "Thanks to Adam's advice, my problem was solved"

**Technical Improvements:**
- Advanced natural language understanding powered by Large Language Models (GPT-4o-mini)
- Contextual analysis of conversation meaning, not just keywords
- Improved reliability with automatic fallback mechanisms if API services are unavailable
- Optimized performance with lightweight models and smart caching

### Support

For additional help or questions about the service recommendation system, contact the system administrator. 