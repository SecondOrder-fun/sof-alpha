// src/routes/AccountPage.jsx
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const AccountPage = () => {
  const { address, isConnected } = useAccount();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My Account</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Your wallet and raffle participation details.</CardDescription>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div>
              <p><span className="font-semibold">Address:</span> {address}</p>
              <p className="mt-4 text-muted-foreground">Your ticket holdings, participation history, and winnings will be displayed here in the future.</p>
            </div>
          ) : (
            <p>Please connect your wallet to view your account details.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountPage;
