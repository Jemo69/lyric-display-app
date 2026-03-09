import React, { useCallback } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import useToast from '../../hooks/useToast';

export default function BibleImportModal({ onImport, darkMode }) {
  const { showToast } = useToast();

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      if (file.name.endsWith('.xml') || file.name.endsWith('.json')) {
        try {
          await onImport(file);
        } catch (error) {
          showToast({
            title: 'Import failed',
            message: `Could not import ${file.name}: ${error.message}`,
            variant: 'error'
          });
        }
      } else {
        showToast({
          title: 'Unsupported file',
          message: `${file.name} is not a supported Bible format`,
          variant: 'warning'
        });
      }
    }
  }, [onImport, showToast]);

  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files);
    
    for (const file of files) {
      try {
        await onImport(file);
      } catch (error) {
        showToast({
          title: 'Import failed',
          message: `Could not import ${file.name}: ${error.message}`,
          variant: 'error'
        });
      }
    }
    
    e.target.value = '';
  }, [onImport, showToast]);

  return (
    <div 
      className="p-6"
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className={`
        border-2 border-dashed rounded-xl p-12 text-center transition-colors
        ${darkMode 
          ? 'border-gray-600 hover:border-blue-500 bg-gray-800/50' 
          : 'border-gray-300 hover:border-blue-500 bg-gray-50'}
      `}>
        <Upload className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
        
        <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Drop Bible XML files here
        </p>
        
        <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          or click to browse
        </p>
        
        <input
          type="file"
          accept=".xml,.json"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="bible-file-input"
        />
        
        <label
          htmlFor="bible-file-input"
          className="inline-block px-6 py-2 rounded-lg font-medium cursor-pointer bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Browse Files
        </label>
      </div>
      
      <div className="mt-6">
        <h4 className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Supported Formats
        </h4>
        
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'Zefania', ext: '.xml', desc: 'Most common Church XML' },
            { name: 'OSIS', ext: '.xml', desc: 'Open Scriptural Info' },
            { name: 'Beblia', ext: '.xml', desc: 'Beblia Bible format' },
            { name: 'OpenSong', ext: '.xml', desc: 'OpenSong Bible format' },
            { name: 'FreeShow', ext: '.json', desc: 'FreeShow backup' }
          ].map((format) => (
            <div
              key={format.name}
              className={`flex items-start gap-3 p-3 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}
            >
              <FileText className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              <div>
                <div className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  {format.name} <span className="text-gray-400">{format.ext}</span>
                </div>
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {format.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className={`
        mt-6 flex items-start gap-3 p-4 rounded-lg
        ${darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}
      `}>
        <AlertCircle className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
        <div className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
          <p className="font-medium mb-1">Where to get Bible files?</p>
          <p className="text-xs">Download free Bible XML files from:</p>
          <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
            <li><a href="https://www.biblesupport.com" target="_blank" rel="noopener noreferrer" className="underline">BibleSupport.com</a></li>
            <li><a href="https://www.ph4.org" target="_blank" rel="noopener noreferrer" className="underline">PH4.org</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
