// src/components/infofi/ArbitrageOpportunityDisplay.jsx
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

/**
 * ArbitrageOpportunityDisplay (scaffold)
 * Minimal fetch + list rendering. If raffleId is provided, filter client-side.
 */
const ArbitrageOpportunityDisplay = ({ raffleId }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/arbitrage/opportunities')
        if (!res.ok) throw new Error(`Failed to fetch opportunities (${res.status})`)
        const data = await res.json()
        let list = data?.opportunities || []
        if (raffleId != null) {
          list = list.filter((o) => String(o.raffle_id) === String(raffleId))
        }
        if (mounted) setItems(list)
      } catch (e) {
        if (mounted) setError(e)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [raffleId])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arbitrage Opportunities</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-muted-foreground">Loading...</p>}
        {error && <p className="text-red-500">Failed to load opportunities</p>}
        {!loading && !error && (
          <div className="space-y-2">
            {items.length === 0 && (
              <p className="text-muted-foreground">No opportunities detected.</p>
            )}
            {items.map((it) => (
              <div key={`${it.market_id}-${it.created_at}`} className="border rounded p-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium">Market {it.market_id}</div>
                    <div className="text-xs text-muted-foreground">
                      Raffle: {it.raffle_id} • Player: {it.player_address}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-medium">{Number(it.profitability || 0).toFixed(2)}%</div>
                    <div className="text-xs text-muted-foreground">Δ {Number(it.price_difference || 0).toFixed(4)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

ArbitrageOpportunityDisplay.propTypes = {
  raffleId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
}

export default ArbitrageOpportunityDisplay
