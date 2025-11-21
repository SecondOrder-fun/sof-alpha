// src/routes/UsersIndex.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import UsernameDisplay from "@/components/user/UsernameDisplay";

const UsersIndex = () => {
  const { t } = useTranslation("common");
  const { address: myAddress } = useAccount();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Fetch players from backend API (which queries Supabase database)
        const response = await fetch("/api/users");

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!cancelled) {
          setPlayers(data.players || []);
          // eslint-disable-next-line no-console
          console.log(
            "[UsersIndex] Loaded",
            data.count,
            "players from database"
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[UsersIndex] Error loading players:", err);
        if (!cancelled) {
          setError(err.message);
          setPlayers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset to first page when players list changes
  useEffect(() => {
    setPage(1);
  }, [players.length]);

  const total = players.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageSlice = players.slice(start, end);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t("leaderboard")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("allUserProfiles")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-muted-foreground">{t("loading")}</p>}
          {error && (
            <div className="space-y-2">
              <p className="text-red-600">Error loading players: {error}</p>
              <p className="text-sm text-muted-foreground">
                Make sure the backend server is running on port 3000.
              </p>
            </div>
          )}
          {!loading && !error && players.length === 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground">{t("noUsersFound")}</p>
              <p className="text-sm text-muted-foreground">
                No players have participated in any seasons yet. Players will
                appear here once they buy tickets in a season.
              </p>
            </div>
          )}
          {!loading && !error && players.length > 0 && (
            <div className="divide-y rounded border">
              {pageSlice.map((addr) => {
                const isMyAddress =
                  myAddress &&
                  addr?.toLowerCase?.() === myAddress.toLowerCase();
                const linkTo = isMyAddress ? "/account" : `/users/${addr}`;

                return (
                  <Link
                    key={addr}
                    to={linkTo}
                    className="flex items-center justify-between px-3 py-2 hover:bg-accent/40 transition-colors"
                  >
                    <UsernameDisplay address={addr} showBadge={true} />
                  </Link>
                );
              })}
            </div>
          )}
          {/* Pagination Controls */}
          {!loading && !error && players.length > 0 && (
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-muted-foreground">
                {t("showingRange", {
                  start: start + 1,
                  end: Math.min(end, total),
                  total,
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 rounded border disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  {t("previous")}
                </button>
                <span className="text-sm">
                  {t("page")} {page} / {pageCount}
                </span>
                <button
                  className="px-3 py-1 rounded border disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                >
                  {t("next")}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersIndex;
