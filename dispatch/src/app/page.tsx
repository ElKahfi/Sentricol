import DispatchConsole from '@/components/DispatchConsole'
import { currentPlayer, localAdminPlayer } from '@/lib/player-auth'
import { getDatabase } from '@/lib/db'
import { redirect } from 'next/navigation'
export default async function Home() {
  const player=await currentPlayer()
  if(!player) redirect('/login')
  const adminTools = Boolean(await localAdminPlayer())
  const courseModeEnabled = adminTools && Boolean((await getDatabase().query(
    'SELECT 1 FROM email_course_enrollments WHERE user_id=$1', [player.userId])).rowCount)
  return <DispatchConsole player={player} adminTools={adminTools} courseModeEnabled={courseModeEnabled} />
}
