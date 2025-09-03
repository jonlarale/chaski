import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {useInput} from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import {SettingsService} from '../services/settingsService.js';

interface SettingsDialogProps {
	settingsService: SettingsService;
	onClose: () => void;
}

type SettingCategory = 'display' | 'shortcuts';

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
	settingsService,
	onClose,
}) => {
	const [category, setCategory] = useState<SettingCategory | null>(null);
	const [selectedSetting, setSelectedSetting] = useState<string | null>(null);
	const [inputValue, setInputValue] = useState('');
	const settings = settingsService.getSettings();

	useInput((_input, key) => {
		if (key.escape) {
			onClose();
		}
	});

	const categoryItems = [
		{label: 'Display Settings', value: 'display'},
		{label: 'Keyboard Shortcuts (Coming Soon)', value: 'shortcuts'},
	];

	const displaySettingItems = [
		{
			label: `Messages per page (current: ${settings.display.messagesPerPage})`,
			value: 'messagesPerPage',
		},
		{
			label: `Folders expanded by default (current: ${
				settings.display.foldersExpanded ? 'Yes' : 'No'
			})`,
			value: 'foldersExpanded',
		},
	];

	const handleCategorySelect = (item: {value: string}) => {
		if (item.value === 'shortcuts') {
			// Shortcuts not implemented yet
			return;
		}
		setCategory(item.value as SettingCategory);
	};

	const handleDisplaySettingSelect = (item: {value: string}) => {
		setSelectedSetting(item.value);
		if (item.value === 'messagesPerPage') {
			setInputValue(settings.display.messagesPerPage.toString());
		}
	};

	const handleMessagesPerPageSubmit = (value: string) => {
		const num = parseInt(value, 10);
		if (isNaN(num) || num < 1 || num > 100) {
			console.log('Please enter a number between 1 and 100');
			return;
		}

		try {
			settingsService.setMessagesPerPage(num);
			console.log(`Messages per page set to ${num}`);
			setSelectedSetting(null);
			setCategory(null);
		} catch (error) {
			console.error('Failed to update setting:', error);
		}
	};

	const handleFoldersExpandedSelect = (item: {value: string}) => {
		const value = item.value === 'yes';
		try {
			settingsService.setFoldersExpanded(value);
			console.log(`Folders expanded by default: ${value ? 'Yes' : 'No'}`);
			setSelectedSetting(null);
			setCategory(null);
		} catch (error) {
			console.error('Failed to update setting:', error);
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="green">
				Settings
			</Text>
			<Text dimColor>Press ESC to close</Text>
			<Box marginTop={1}>
				{!category && (
					<Box flexDirection="column">
						<Text>Select a category:</Text>
						<Box marginTop={1}>
							<SelectInput
								items={categoryItems}
								onSelect={handleCategorySelect}
							/>
						</Box>
					</Box>
				)}

				{category === 'display' && !selectedSetting && (
					<Box flexDirection="column">
						<Text>Display Settings:</Text>
						<Box marginTop={1}>
							<SelectInput
								items={displaySettingItems}
								onSelect={handleDisplaySettingSelect}
							/>
						</Box>
					</Box>
				)}

				{selectedSetting === 'messagesPerPage' && (
					<Box flexDirection="column">
						<Text>Enter messages per page (1-100):</Text>
						<Box marginTop={1}>
							<TextInput
								value={inputValue}
								placeholder="20"
								onChange={setInputValue}
								onSubmit={handleMessagesPerPageSubmit}
							/>
						</Box>
					</Box>
				)}

				{selectedSetting === 'foldersExpanded' && (
					<Box flexDirection="column">
						<Text>Expand folders by default?</Text>
						<Box marginTop={1}>
							<SelectInput
								items={[
									{label: 'Yes', value: 'yes'},
									{label: 'No', value: 'no'},
								]}
								onSelect={handleFoldersExpandedSelect}
							/>
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
};
