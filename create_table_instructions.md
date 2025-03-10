# Instructions for Creating the ServiceRecommendations Table in Airtable

Follow these steps to create the ServiceRecommendations table in your Airtable base:

1. **Log in to Airtable**
   - Go to https://airtable.com and log in with your credentials

2. **Navigate to Your Base**
   - Open the base with ID: `appqFUyMAd8cPBdJb`

3. **Create a New Table**
   - Click the "+" button next to your existing tables
   - Name the new table: `ServiceRecommendations`

4. **Set Up Fields**
   - The table needs the following fields:
     - `UserID` (Single line text)
     - `ServiceID` (Single line text)
     - `Timestamp` (Date & Time)

5. **Verify Permissions**
   - Make sure the API key `patCpVSRsAKp9traE.0f6d1327e5d2c326e351a4f84b2f94b6c1395029fe311ba0fe8eba3ed79e594d` has access to this table
   - Go to "Share" > "API" and check that the API key has the necessary permissions

6. **Restart Your Heroku App**
   - After creating the table, restart your Heroku app with:
   ```
   heroku restart
   ```

7. **Verify It's Working**
   - Check the logs to confirm the table is now accessible:
   ```
   heroku logs --tail
   ```
   - Look for the message: "ServiceRecommendations table exists and is accessible"

This will enable the full functionality of service recommendation tracking and cooldown periods in your application. 