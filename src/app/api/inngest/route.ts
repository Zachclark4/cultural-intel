import { serve } from 'inngest/next'
import { inngest } from '../../../../inngest/client'
import {
  ingestYouTube, ingestTikTok, ingestInstagram,
  snapshotPosts, detectBreakouts,
  populateWatchlist, monitorWatchlist, generateFormatIntel,
} from '../../../../inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ingestYouTube, ingestTikTok, ingestInstagram,
    snapshotPosts, detectBreakouts,
    populateWatchlist, monitorWatchlist, generateFormatIntel,
  ],
})
