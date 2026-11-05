/** API prices are integer minor units (35000 = 350,00 RSD); forms work in major units. */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}
