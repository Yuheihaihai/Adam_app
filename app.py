from tenacity import retry, stop_after_attempt, wait_exponential

# Add retry decorator for API calls
@retry(
    stop=stop_after_attempt(3),  # Try 3 times
    wait=wait_exponential(multiplier=1, min=4, max=10),  # Wait between 4-10 seconds, increasing exponentially
    reraise=True
)
def make_perplexity_call(client, *args, **kwargs):
    # Add timeout parameter
    kwargs['timeout'] = 25  # Set timeout to 25 seconds
    return client.chat.create(*args, **kwargs)

def process_job_trends_async(line_bot_api, event, client, prompt):
    try:
        response = make_perplexity_call(
            client,
            messages=[{"role": "user", "content": prompt}],
            model="mixtral-8x7b-instruct",
            timeout=25  # Explicit timeout
        )
        
        # Send the result back to the user
        line_bot_api.push_message(
            event.source.user_id,
            TextSendMessage(text=response.choices[0].message.content)
        )
    except Exception as e:
        logger.error(f"Perplexity job trends error: {str(e)}")
        line_bot_api.push_message(
            event.source.user_id,
            TextSendMessage(text="申し訳ありません。処理中にエラーが発生しました。しばらく経ってからもう一度お試しください。")
        )

# Then in your webhook handler:
def handle_webhook():
    # ... existing code ...
    try:
        response = make_perplexity_call(
            client,
            # ... existing parameters ...
        )
    except Exception as e:
        logger.error(f"Failed after retries: {str(e)}")
        # Handle the error appropriately
    
    # ... existing code ... 