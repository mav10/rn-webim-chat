import React, { act } from 'react';
import { Text } from 'react-native';
import { create, ReactTestRenderer } from 'react-test-renderer';
import { ServerVideo } from '../../example/src/withCustomUI/server-video';

jest.mock('../../example/node_modules/react', () =>
  jest.requireActual('react')
);

jest.mock(
  'react-native-video',
  () => ({ __esModule: true, default: jest.fn(() => null) }),
  { virtual: true }
);

jest.mock(
  'lucide-react-native',
  () => ({ ExternalLink: () => null, Play: () => null }),
  { virtual: true }
);

type VideoProps = {
  source: { uri: string };
  paused: boolean;
  controls: boolean;
  playInBackground: boolean;
  playWhenInactive: boolean;
  onError: () => void;
};

const MockVideo = jest.requireMock('react-native-video')
  .default as React.ComponentType<VideoProps>;
const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
const url = 'https://chat.example.com/uploads/server-video.mp4';
const name = 'server-video.mp4';

let renderer: ReactTestRenderer | undefined;

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

afterAll(() => {
  if (previousActEnvironment === undefined) {
    delete actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  } else {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

function renderVideo(onOpen = jest.fn()) {
  let mounted!: ReactTestRenderer;
  act(() => {
    mounted = create(<ServerVideo url={url} name={name} onOpen={onOpen} />);
  });
  renderer = mounted;
  return mounted.root;
}

describe('ServerVideo', () => {
  it('passes the server HTTPS source and starts paused without controls or background playback', () => {
    const root = renderVideo();

    expect(root.findByType(MockVideo).props).toMatchObject({
      source: { uri: url },
      paused: true,
      controls: false,
      playInBackground: false,
      playWhenInactive: false,
    });
    const play = root.findByProps({ accessibilityLabel: `Play ${name}` });
    expect(play.props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: `Play ${name}`,
    });
  });

  it('starts playback and enables controls when Play is pressed', () => {
    const root = renderVideo();
    const play = root.findByProps({ accessibilityLabel: `Play ${name}` });

    act(() => play.props.onPress());

    expect(root.findByType(MockVideo).props).toMatchObject({
      source: { uri: url },
      paused: false,
      controls: true,
      playInBackground: false,
      playWhenInactive: false,
    });
    expect(
      root.findAllByProps({ accessibilityLabel: `Play ${name}` })
    ).toHaveLength(0);
  });

  it('replaces an errored player with a filename link that opens the server URL', () => {
    const onOpen = jest.fn();
    const root = renderVideo(onOpen);

    act(() => root.findByType(MockVideo).props.onError());

    expect(root.findAllByType(MockVideo)).toHaveLength(0);
    expect(root.findByType(Text).props.children).toBe(name);
    const link = root.findByProps({ accessibilityLabel: `Open ${name}` });
    expect(link.props).toMatchObject({
      accessibilityRole: 'link',
      accessibilityLabel: `Open ${name}`,
    });
    expect(onOpen).not.toHaveBeenCalled();

    act(() => link.props.onPress());

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(url);
  });
});
