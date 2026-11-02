/**
 * The work origin lines of the G-code header: `;origin: <name>` and, when the origin has an offset,
 * `;origin_offset(mm): <x>,<y>` (the offset is already in the tool path coordinates; the line documents it).
 */
export function originHeaderLines({ origin, originOffset }) {
    return `;origin: ${origin}\n${originOffset ? `;origin_offset(mm): ${originOffset}\n` : ''}`;
}
