#!/bin/bash
# deploy.sh - Script to deploy the application to Heroku

echo "Deploying to Heroku..."

# Add all files to git
git add .

# Commit changes
git commit -m "Fix token limit error in embedding service"

# Push to Heroku
git push heroku main

echo "Deployment completed!" 