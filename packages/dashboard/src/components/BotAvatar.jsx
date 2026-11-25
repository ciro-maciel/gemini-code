import { Box, Text } from '@mantine/core';

import { mascotUrl } from '../services/api';

/**
 * The bot's mascot: an illustration from the bank, on the gray scale, in a
 * square (radius 0, like every portrait in the system). Its state moves with
 * it, as in Grok Bot: it pulses while working and carries a square when it
 * waits for you. Until the mascot is chosen, the initial stands in.
 */
export function BotAvatar({ bot, size = 36, isInverted = false }) {
  const isWorking = bot?.runningCount > 0 || bot?.status === 'provisioning';
  const isWaiting = bot?.waitingCount > 0;
  const isFailed = bot?.status === 'failed';
  const mark = Math.max(8, Math.round(size * 0.24));
  return (
    <Box
      pos="relative"
      w={size}
      h={size}
      bg={
        bot?.mascot
          ? 'white'
          : isFailed
            ? 'red.6'
            : isInverted
              ? 'white'
              : 'gray.9'
      }
      bd={
        bot?.mascot
          ? isFailed
            ? '1px solid var(--mantine-color-red-6)'
            : 'var(--rlg-border)'
          : undefined
      }
      className={isWorking ? 'assistant-pulse' : undefined}
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {bot?.mascot ? (
        <Box w="100%" h="100%" className="assistant-mascot-frame">
          <img
            alt=""
            src={mascotUrl(bot.mascot)}
            width={size}
            height={size}
            className="assistant-mascot"
            draggable={false}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </Box>
      ) : (
        <Text
          c={isInverted && !isFailed ? 'gray.9' : 'white'}
          fw={900}
          fz={Math.round(size * 0.44)}
          lh={1}
          lts="-0.04em"
        >
          {(bot?.name || '?').trim().charAt(0).toUpperCase()}
        </Text>
      )}
      {isWaiting && (
        <Box
          pos="absolute"
          right={-3}
          bottom={-3}
          w={mark}
          h={mark}
          bg="gray.9"
          bd="2px solid var(--mantine-color-white)"
          aria-label="Esperando você"
        />
      )}
    </Box>
  );
}
