import { Stack, Typography, useTheme } from '@mui/material'
import { SourceDetails } from '../../../utils/supportedSources'
import { getTimeSince } from '../../../utils/time'
import { minutesToHours } from '../Time/utils'
import { SourceTimeChart } from './SourceTimeChart'

interface SourceRowProps {
  source: SourceDetails
  lastActive: string
  minutes: number
}

export const SourceRow = ({ source, lastActive, minutes }: SourceRowProps) => {
  const theme = useTheme()
  const compareTime = 90

  const typeColors = [
    {
      type: 'code',
      color: theme.palette.graphColors.blue,
    },
    {
      type: 'web',
      color: theme.palette.graphColors.green,
    },
  ]

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      width="100%"
    >
      <Stack direction="row" alignItems="center" spacing={1} width="100%">
        <img
          alt={source.displayName + ' Logo'}
          src={source.logo}
          style={{ height: '32px', width: '32px' }}
        />
        <Stack direction="column" width="100%">
          <Typography variant="body2" fontWeight={700}>
            {source.displayName}
          </Typography>
          {minutes > 0 && (
            <SourceTimeChart
              time={minutesToHours(minutes)}
              progress={Math.floor((minutes / compareTime) * 100)}
              color={
                typeColors.find((typeColor) => typeColor.type === source.type)
                  ?.color ?? theme.palette.graphColors.blue
              }
            />
          )}
          <Stack direction="row" justifyContent="space-between">
            {minutes === 0 && lastActive && (
              <Typography
                variant="body2"
                fontWeight={400}
                color={theme.palette.grey[300]}
              >
                {`Last pulse ${getTimeSince(lastActive)}`}
              </Typography>
            )}
            {minutes === 0 && (
              <Typography
                variant="body1"
                fontWeight={400}
                color={theme.palette.grey[300]}
              >
                0m
              </Typography>
            )}
          </Stack>
        </Stack>
      </Stack>
    </Stack>
  )
}