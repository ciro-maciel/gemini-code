import { Skeleton, Stack } from '@mantine/core';

// A file on its way has the shape of the page it will become: a title and
// paragraphs, on the same paper, so nothing jumps when the text arrives.
const PARAGRAPHS = [
  ['96%', '100%', '88%', '62%'],
  ['100%', '93%', '71%'],
  ['98%', '100%', '84%', '46%'],
];

export function FileSkeleton() {
  return (
    <div className="paper" aria-busy="true" aria-label="Loading file">
      <Skeleton h={26} w="54%" radius={0} mb={28} />
      <Stack gap={28}>
        {PARAGRAPHS.map((lines, paragraph) => (
          <Stack key={paragraph} gap={10}>
            {lines.map((width, line) => (
              <Skeleton key={line} h={12} w={width} radius={0} />
            ))}
          </Stack>
        ))}
      </Stack>
    </div>
  );
}
