import React from 'react';

export const Stage = ({ children, ...props }) => React.createElement('div', { className: 'konva-stage' }, children);
export const Layer = ({ children, ...props }) => React.createElement('div', { className: 'konva-layer' }, children);
export const Rect = (props) => React.createElement('div', { className: 'konva-rect' });
export const Text = (props) => React.createElement('div', { className: 'konva-text' });
export const Group = ({ children, ...props }) => React.createElement('div', { className: 'konva-group' }, children);
export const Line = (props) => React.createElement('div', { className: 'konva-line' });
export const Image = (props) => React.createElement('div', { className: 'konva-image' });
export const Transformer = (props) => React.createElement('div', { className: 'konva-transformer' });

export default {
  Stage,
  Layer,
  Rect,
  Text,
  Group,
  Line,
  Image,
  Transformer,
};
