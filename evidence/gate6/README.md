# Gate 6 evidence

Gate 6 is the final hostile product audit for the ArcMemePerps frontend.

- Product target: `arc-testnet-product-v2`
- Chain: Arc Testnet (`5042002`)
- Contract source SHA: `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`
- Starting HEAD: `f5d822c3e27054e5e068da559a8ff88aa63db8f9`
- Current backend source SHA: `0x3003a13ddddf5f5d675bad7dfc45e0888050d62d0232fb497c59abebbb6a3fd3`
- Local API: `http://127.0.0.1:8787/api/v1`
- Frontend port: `3001`

The Product deployment is healthy onchain (`solvencyBlocked=false`, bad debt `0`). Its current oracle observation is stale, so live risk-increasing review is visibly disabled and `backend:frontend-readiness:live` correctly reports `NO`. No synthetic price, chart, balance, order, or notification data was added to hide this condition.

Evidence in this directory covers browser regression, responsive checks, security and no-fake-data review, performance observations, release environment requirements, the judge walkthrough, and the final audit matrix.
