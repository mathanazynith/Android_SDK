declare module 'react-native-razorpay' {
  type CheckoutResponse = {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
    razorpay_signature: string;
  };

  const RazorpayCheckout: {
    open(options: Record<string, unknown>): Promise<CheckoutResponse>;
  };

  export default RazorpayCheckout;
}
