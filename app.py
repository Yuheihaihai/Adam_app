from tenacity import retry, stop_after_attempt, wait_exponential

# Add retry decorator for API calls
@retry(
    stop=stop_after_attempt(3),  # Try 3 times
    wait=wait_exponential(multiplier=1, min=4, max=10),  # Wait between 4-10 seconds, increasing exponentially
    reraise=True
)
def make_perplexity_call(client, *args, **kwargs):
    return client.chat.create(*args, **kwargs)

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