import { LoaderUtils } from "three";
import {
  type GLTF,
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Decode meshopt buffers off the main thread. GLTFLoader uses the decoder's
// async path, which hands work to these workers once they exist.
let workers = false;
function decoder() {
  if (!workers) {
    // Not a React hook, despite the name.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    MeshoptDecoder.useWorkers(
      Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
    );
    workers = true;
  }
  return MeshoptDecoder;
}

/**
 * Fetches a shell GLB. The processor ships it gzipped (`.glb.gz`) because
 * meshopt output shrinks by a further ~40% under gzip and static hosts don't
 * reliably compress `model/gltf-binary` themselves. The gzip magic bytes, not
 * the extension, decide: a server that already sent `Content-Encoding: gzip`
 * hands over plain GLB bytes, which pass straight through.
 */
export async function fetchShell(url: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Stadium model request returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer;
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** GLTFLoader for `useLoader`, reading gzipped GLBs and decoding meshopt in workers. */
export class ShellLoader extends GLTFLoader {
  constructor(...args: ConstructorParameters<typeof GLTFLoader>) {
    super(...args);
    this.setMeshoptDecoder(decoder());
  }

  override load(
    url: string,
    onLoad: (gltf: GLTF) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ) {
    const resolved = this.manager.resolveURL(url);
    this.manager.itemStart(resolved);
    const fail = (error: unknown) => {
      if (onError) onError(error);
      else console.error(error);
      this.manager.itemError(resolved);
      this.manager.itemEnd(resolved);
    };
    fetchShell(resolved)
      .then((buffer) =>
        this.parse(
          buffer,
          this.resourcePath || LoaderUtils.extractUrlBase(resolved),
          (gltf) => {
            onLoad(gltf);
            this.manager.itemEnd(resolved);
          },
          fail,
        ),
      )
      .catch(fail);
  }
}
