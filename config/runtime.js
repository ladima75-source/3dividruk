// Static preview. The isolated backend serves its own configuration at this path.
window.DIVIDRUK_COMMERCE_CONFIG = Object.freeze({
  apiBaseUrl: '', checkoutMode: 'preview', requestTimeoutMs: 12000,
  endpoints: {catalog:'/api/v1/catalog', createOrder:'/api/v1/orders', getOrder:'/api/v1/orders/{orderId}', paymentMethods:'/api/v1/payments/methods'}
});
