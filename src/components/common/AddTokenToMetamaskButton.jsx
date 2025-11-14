// src/components/common/AddTokenToMetamaskButton.jsx
import PropTypes from 'prop-types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Wallet } from 'lucide-react';

const AddTokenToMetamaskButton = ({
  address,
  symbol,
  decimals,
  image,
  label,
  fullWidth,
  size,
  variant,
  disabled,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(null); // 'success' or 'error'

  const handleAddToMetamask = async () => {
    if (!address) return;

    if (typeof window === 'undefined' || !window.ethereum) {
      setMessageType('error');
      setMessage('MetaMask is not installed. Please install MetaMask to use this feature.');
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const wasAdded = await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address,
            symbol,
            decimals,
            image,
          },
        },
      });

      if (wasAdded) {
        setMessageType('success');
        setMessage(`${symbol} token added to MetaMask successfully!`);
        setTimeout(() => {
          setMessage(null);
        }, 5000);
      } else {
        setMessageType('error');
        setMessage(`Failed to add ${symbol} token to MetaMask.`);
      }
    } catch (error) {
      setMessageType('error');
      setMessage(error?.message || 'An error occurred while adding the token.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={handleAddToMetamask}
        disabled={isLoading || !address || disabled}
        variant={variant || 'outline'}
        size={size || 'default'}
        className={fullWidth ? 'w-full' : ''}
      >
        <Wallet className="mr-2 h-4 w-4" />
        {isLoading ? `Adding ${symbol}...` : (label || `Add ${symbol} to MetaMask`)}
      </Button>

      {message && (
        <Alert
          variant={messageType === 'error' ? 'destructive' : 'default'}
          className={messageType === 'success' ? 'bg-green-50 border-green-200' : ''}
        >
          {messageType === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertTitle>{messageType === 'success' ? 'Success' : 'Error'}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

AddTokenToMetamaskButton.propTypes = {
  address: PropTypes.string,
  symbol: PropTypes.string.isRequired,
  decimals: PropTypes.number,
  image: PropTypes.string,
  label: PropTypes.string,
  fullWidth: PropTypes.bool,
  size: PropTypes.string,
  variant: PropTypes.string,
  disabled: PropTypes.bool,
};

AddTokenToMetamaskButton.defaultProps = {
  decimals: 18,
  image: undefined,
  label: undefined,
  fullWidth: false,
  size: 'default',
  variant: 'outline',
  disabled: false,
};

export default AddTokenToMetamaskButton;
