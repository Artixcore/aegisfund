/** Minimal typings for `viem` when resolving the package for `tsc`. */
declare module "viem" {
  export function isAddress(address: string): address is `0x${string}`;
  export function verifyMessage(parameters: {
    address: `0x${string}`;
    message: string;
    signature: `0x${string}`;
  }): Promise<boolean>;
}
