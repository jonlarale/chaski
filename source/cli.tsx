#!/usr/bin/env node
import React from 'react';
import {render, Text} from 'ink';
import meow from 'meow';

type Props = {
	name: string | undefined;
};

function App({name = 'Stranger'}: Props) {
	return (
		<Text>
			Hello, <Text color="green">{name}</Text>
		</Text>
	);
}

const cli = meow(
	`
	Usage
	  $ chaski

	Options
		--name  Your name

	Examples
	  $ chaski --name=Jane
	  Hello, Jane
`,
	{
		importMeta: import.meta,
		flags: {
			name: {
				type: 'string',
			},
		},
	},
);

render(<App name={cli.flags.name} />);
