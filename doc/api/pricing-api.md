# Pricing API Documentation

This document outlines the Pricing API endpoints for the SecondOrder.fun platform.

## Real-Time Pricing Stream

### Get Market Pricing Stream

Establishes a Server-Sent Events (SSE) connection to receive real-time price updates for a specific InfoFi market.

- **Endpoint**: `GET /api/pricing/markets/:id/pricing-stream`
- **Authentication**: None required
- **Protocol**: Server-Sent Events (SSE)

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | number | InfoFi market ID |

#### Response (SSE Events)

The endpoint sends SSE events with the following types:

1. **Connected Event**

```json
{
  "type": "connected",
  "timestamp": 1684154400000
}
```

1. **Price Update Event**

```json
{
  "market_id": 1,
  "yes_price": 0.65,
  "no_price": 0.35,
  "timestamp": "2023-05-15T14:30:00Z"
}
```

1. **Heartbeat Event**

```json
{
  "type": "heartbeat",
  "timestamp": 1684154400000
}
```

#### Example JavaScript Usage

```javascript
const eventSource = new EventSource('/api/pricing/markets/1/pricing-stream');

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  
  if (data.type === 'connected') {
    console.log('Connected to pricing stream');
  } else if (data.type === 'heartbeat') {
    console.log('Heartbeat received');
  } else {
    // Price update
    console.log('Price update:', data);
  }
};

eventSource.onerror = function(err) {
  console.error('EventSource failed:', err);
};
```
