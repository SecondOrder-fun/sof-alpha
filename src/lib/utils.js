import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatCurrency(amount, decimals = 18, symbol = 'ETH') {
  if (!amount) return '0 ' + symbol;
  
  const value = parseFloat(amount) / Math.pow(10, decimals);
  
  if (value < 0.0001) return '<0.0001 ' + symbol;
  if (value < 1) return value.toFixed(4) + ' ' + symbol;
  if (value < 1000) return value.toFixed(2) + ' ' + symbol;
  
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + symbol;
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeUntil(timestamp) {
  const now = Date.now();
  const endTime = new Date(timestamp).getTime();
  const diff = endTime - now;
  
  if (diff <= 0) return 'Ended';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}